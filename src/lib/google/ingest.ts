import "server-only";
import { geminiStructured } from "@/lib/llm/gemini";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/google/store";
import { listMessageIds, getMessage, gmailLink, type GmailMessage } from "@/lib/google/gmail";
import { listEvents } from "@/lib/google/calendar";
import { loadGoalDigests } from "@/lib/goals/facts";
import { loadProfile, profileDigest } from "@/lib/profile";
import { extractItemsFromSources } from "@/lib/google/extract-items";

/**
 * Gmail + Calendar ingestion. Gmail is triaged relative to the user's goals/profile: only genuinely
 * important mail is kept (spam/promotions/noise dropped entirely), grouped by sender/org. Calendar is
 * kept as-is (no filtering). Everything is stored as `sources` (the provenance anchor), deduped by id.
 */

type Classification = { idx: number; keep: boolean; category: string; group: string };

const CLASSIFY_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          idx: { type: "number" },
          keep: { type: "boolean" },
          category: { type: "string", enum: ["opportunity", "person", "update", "other"] },
          group: { type: "string" },
        },
        required: ["idx", "keep", "group"],
      },
    },
  },
  required: ["items"],
};

async function relevance(supabase: SupabaseClient): Promise<string> {
  const [profile, goals] = await Promise.all([loadProfile(supabase), loadGoalDigests(supabase)]);
  const parts = [profileDigest(profile)];
  // Include descriptions: a sub-goal's specificity ("expand criminal-justice member attendance")
  // lives there, and it is exactly what makes goal-relevant correspondence stand out in triage.
  if (goals.length)
    parts.push(`Goals:\n${goals.map((g) => `- ${g.title}${g.description ? `: ${g.description}` : ""}`).join("\n")}`);
  return parts.filter(Boolean).join("\n\n");
}

async function classifyEmails(emails: GmailMessage[], who: string): Promise<Map<number, Classification>> {
  const list = emails
    .map((e, i) => `[${i}] from: ${e.fromName} <${e.fromEmail}> | subject: ${e.subject} | ${e.snippet.slice(0, 160)}`)
    .join("\n");

  const out = await geminiStructured<{ items?: Record<string, unknown>[] }>({
    system: `You triage a person's inbox. KEEP only genuinely important emails; DROP promotions, marketing, newsletters, social notifications, automated noise, and spam (keep=false for those). For kept emails, GROUP by the sender's organization or person (e.g. "Brown University", "Jane Smith", "YC"). Judge importance relative to the user below.${who ? `\n\n${who}` : ""}`,
    user: `Triage these inbox emails:\n${list}`,
    schema: CLASSIFY_SCHEMA,
    maxTokens: 4000,
  });

  const items = (out?.items ?? []) as Record<string, unknown>[];
  const map = new Map<number, Classification>();
  for (const it of items) {
    const idx = Number(it.idx);
    if (!Number.isInteger(idx)) continue;
    map.set(idx, {
      idx,
      keep: it.keep !== false,
      category: String(it.category ?? "other"),
      group: String(it.group ?? "").trim() || "Other",
    });
  }
  return map;
}

export type GmailIngestResult = {
  imported: number;
  itemsExtracted: number;
  groups: { label: string; count: number }[];
};

export async function ingestGmail(supabase: SupabaseClient, userId: string): Promise<GmailIngestResult> {
  const token = await getValidAccessToken(supabase, userId);
  const ids = await listMessageIds(token, 40);
  if (!ids.length) return { imported: 0, itemsExtracted: 0, groups: [] };

  const emails = (await Promise.all(ids.map((m) => getMessage(token, m.id).catch(() => null)))).filter(
    (e): e is GmailMessage => e !== null,
  );

  const who = await relevance(supabase);
  const cls = await classifyEmails(emails, who);

  // Existing external ids → skip duplicates (the unique index is a partial index, so we dedup in code).
  const { data: existing } = await supabase
    .from("sources")
    .select("external_id")
    .eq("source_type", "email")
    .not("external_id", "is", null);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));

  const groups = new Map<string, number>();
  let imported = 0;
  // Newly-stored email sources whose body we'll mine for action items after the ingest loop.
  const newSources: { id: string; title: string | null; body: string; occurredAt: string | null }[] = [];

  for (let i = 0; i < emails.length; i++) {
    const e = emails[i];
    const c = cls.get(i);
    if (!c || !c.keep || seen.has(e.id)) continue;

    const { data: src, error: srcErr } = await supabase
      .from("sources")
      .insert({
        user_id: userId,
        source_type: "email",
        external_id: e.id,
        title: e.subject,
        from_name: e.fromName,
        from_email: e.fromEmail,
        group_label: c.group,
        permalink: gmailLink(e.id),
        occurred_at: e.dateISO,
        raw_text: e.body || e.snippet,
      })
      .select("id")
      .single();
    if (srcErr || !src) continue; // skip on insert failure (e.g. a dedup race), don't count it
    imported++;
    newSources.push({ id: src.id, title: e.subject, body: e.body || e.snippet, occurredAt: e.dateISO });
    groups.set(c.group, (groups.get(c.group) ?? 0) + 1);
  }

  // Mine the freshly-stored emails for action items (L0 → they land in the Review queue, suggest-only).
  // Best-effort: extraction failures must not fail the ingest that already succeeded.
  let itemsExtracted = 0;
  if (newSources.length) {
    try {
      itemsExtracted = await extractItemsFromSources(supabase, userId, newSources);
    } catch {
      itemsExtracted = 0;
    }
  }

  return {
    imported,
    itemsExtracted,
    groups: [...groups.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

export type CalendarIngestResult = { imported: number };

export async function ingestCalendar(supabase: SupabaseClient, userId: string): Promise<CalendarIngestResult> {
  const token = await getValidAccessToken(supabase, userId);
  const events = await listEvents(token, new Date().toISOString(), 50);
  if (!events.length) return { imported: 0 };

  const { data: existing } = await supabase
    .from("sources")
    .select("external_id")
    .eq("source_type", "calendar")
    .not("external_id", "is", null);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));

  let imported = 0;
  for (const ev of events) {
    // End time lives in its own column (ends_at) so it stays a real timestamp the UI/assistant format
    // deterministically, never a raw ISO buried in raw_text for the model to misread. raw_text now
    // carries only the human detail (location); all-day-ness is flagged so display drops the time.
    const fields = {
      title: ev.summary,
      permalink: ev.htmlLink ?? null,
      occurred_at: ev.startISO,
      ends_at: ev.endISO ?? null,
      is_all_day: ev.allDay,
      raw_text: ev.location || null,
    };
    if (seen.has(ev.id)) {
      // Refresh an event we've already ingested: this picks up reschedules AND self-heals rows stored
      // before ends_at / is_all_day existed. user_id is explicit (belt-and-suspenders with RLS) so a
      // Google event id shared across calendars can never touch another user's row.
      await supabase.from("sources").update(fields).eq("user_id", userId).eq("source_type", "calendar").eq("external_id", ev.id);
      continue;
    }
    await supabase.from("sources").insert({ user_id: userId, source_type: "calendar", external_id: ev.id, ...fields });
    imported++;
  }
  return { imported };
}
