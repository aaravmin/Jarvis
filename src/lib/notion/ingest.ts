import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notionEnabled, searchRecentPages, pageText } from "@/lib/notion/client";
import { extractItemsFromSources } from "@/lib/google/extract-items";

/**
 * Notion → sources ingestion (read-only connector, T3). Pulls pages the user's integration can see
 * that were edited in the last 14 days, stores each as a `sources` row (the provenance anchor, dedup'd
 * by page id like Gmail/Calendar in lib/google/ingest.ts), and mines the freshly-stored/refreshed pages
 * for action items via the shared extractor (kind='notion'). Notion is NEVER written to (hard rule #1:
 * Supabase is the system of record) — this connector only ever reads.
 */

const LOOKBACK_DAYS = 14;
const CHECK_VIOLATION = "23514"; // Postgres error code for sources.source_type CHECK constraint

export type NotionIngestResult = {
  enabled: boolean;
  imported: number;
  itemsExtracted: number;
  error?: string;
};

export async function ingestNotion(supabase: SupabaseClient, userId: string): Promise<NotionIngestResult> {
  if (!notionEnabled()) return { enabled: false, imported: 0, itemsExtracted: 0 };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const pages = await searchRecentPages(since);
  if (!pages.length) return { enabled: true, imported: 0, itemsExtracted: 0 };

  // Existing Notion sources → dedup by page id, but re-ingest one that was edited since we last stored
  // it (the unique index on sources is a partial index, so we dedup in code, same as Gmail/Calendar).
  const { data: existing } = await supabase
    .from("sources")
    .select("id, external_id, occurred_at")
    .eq("source_type", "notion")
    .not("external_id", "is", null);
  const known = new Map((existing ?? []).map((r) => [r.external_id as string, r]));

  let imported = 0;
  // Newly-stored or refreshed Notion sources whose body we'll mine for action items below.
  const forExtraction: { id: string; title: string | null; body: string; occurredAt: string | null }[] = [];

  for (const page of pages) {
    const prior = known.get(page.id);
    const staleOrNew = !prior || !prior.occurred_at || new Date(page.last_edited_time).getTime() > new Date(prior.occurred_at as string).getTime();
    if (!staleOrNew) continue;

    let text = "";
    try {
      text = await pageText(page.id);
    } catch {
      continue; // one bad page (e.g. transient API error) shouldn't fail the whole sync
    }
    if (!text.trim()) continue; // skip empty-text pages, nothing for the extractor to work with

    if (prior) {
      // Refresh in place: same page id, edited since we last stored it (like the calendar refresh
      // path in lib/google/ingest.ts). user_id is explicit (belt-and-suspenders with RLS).
      await supabase
        .from("sources")
        .update({ title: page.title, permalink: page.url, occurred_at: page.last_edited_time, raw_text: text })
        .eq("user_id", userId)
        .eq("source_type", "notion")
        .eq("external_id", page.id);
      imported++;
      forExtraction.push({ id: prior.id as string, title: page.title, body: text, occurredAt: page.last_edited_time });
      continue;
    }

    const { data: src, error: srcErr } = await supabase
      .from("sources")
      .insert({
        user_id: userId,
        source_type: "notion",
        external_id: page.id,
        title: page.title,
        permalink: page.url,
        occurred_at: page.last_edited_time,
        raw_text: text,
      })
      .select("id")
      .single();

    if (srcErr || !src) {
      // Migration 0021 not applied yet → every notion insert fails the same way, stop immediately
      // and hand back a clear, actionable message instead of retrying page after page.
      if (srcErr?.code === CHECK_VIOLATION) {
        return {
          enabled: true,
          imported,
          itemsExtracted: 0,
          error:
            "Notion sync needs migration 0021_notion_sources.sql applied in the Supabase SQL editor (it adds 'notion' to sources.source_type).",
        };
      }
      continue; // skip on other insert failures (e.g. a dedup race), don't count it
    }

    imported++;
    forExtraction.push({ id: src.id, title: page.title, body: text, occurredAt: page.last_edited_time });
  }

  // Mine the freshly-stored/refreshed pages for action items (L0 → they land in the Review queue,
  // suggest-only, rule #5). Best-effort: extraction failures must not fail the ingest that already
  // succeeded. kind='notion' depends on T2 adding 'notion' to SourceKind in extract-items.ts.
  let itemsExtracted = 0;
  if (forExtraction.length) {
    try {
      itemsExtracted = await extractItemsFromSources(supabase, userId, forExtraction, 4, "notion");
    } catch {
      itemsExtracted = 0;
    }
  }

  return { enabled: true, imported, itemsExtracted };
}
