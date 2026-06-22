import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardSource, SourceType } from "@/lib/types";

/**
 * Loads the email-derived action items waiting in the Review queue (roadmap B2). These are the
 * suggest-only (L0) candidates the extractor produced, the user accepts or dismisses each. Every
 * row carries its provenance so the Card primitive can render a working source chip (hard rule #4).
 */

export type ReviewItemType = "task" | "event" | "follow_up";

export type ReviewItem = {
  id: string;
  itemType: ReviewItemType;
  title: string;
  dueAt: string | null;
  reasoning: string | null;
  createdAt: string;
  source: CardSource;
};

type SourceJoin = {
  source_type: SourceType;
  title: string | null;
  permalink: string | null;
  occurred_at: string | null;
  raw_text: string | null;
};

type Row = {
  id: string;
  item_type: string;
  title: string;
  due_at: string | null;
  confidence: number | null;
  source_quote: string | null;
  reasoning: string | null;
  created_at: string;
  sources: SourceJoin | SourceJoin[] | null;
};

export async function loadReviewItems(supabase: SupabaseClient): Promise<ReviewItem[]> {
  const { data } = await supabase
    .from("items")
    .select(
      "id, item_type, title, due_at, confidence, source_quote, reasoning, created_at, sources(source_type, title, permalink, occurred_at, raw_text)",
    )
    .eq("status", "review")
    .in("item_type", ["task", "event", "follow_up"])
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Row[];
  const items: ReviewItem[] = [];
  for (const r of rows) {
    // A FK embed comes back as an object; some client versions type it as an array, normalize.
    const src = Array.isArray(r.sources) ? r.sources[0] : r.sources;
    const quote = (r.source_quote ?? "").trim();
    // The Card primitive throws without a non-empty quote; an item missing one can't be reviewed safely.
    if (!src || !quote) continue;
    items.push({
      id: r.id,
      itemType: (["task", "event", "follow_up"].includes(r.item_type) ? r.item_type : "task") as ReviewItemType,
      title: r.title,
      dueAt: r.due_at,
      reasoning: r.reasoning,
      createdAt: r.created_at,
      source: {
        type: src.source_type ?? "email",
        quote,
        title: src.title ?? undefined,
        permalink: src.permalink ?? undefined,
        occurredAt: src.occurred_at ?? undefined,
        rawText: src.raw_text ?? undefined,
        confidence: r.confidence ?? undefined,
      },
    });
  }
  return items;
}
