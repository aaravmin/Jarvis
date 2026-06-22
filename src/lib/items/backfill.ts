import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractItemsFromSources } from "@/lib/google/extract-items";

/**
 * Backfill action-item extraction over already-ingested sources that have never been mined.
 *
 * Email sync only extracts NEWLY-ingested mail (it dedups by Gmail id), so any email stored before
 * the extractor existed, or before a later improvement, never produced items. Meeting transcripts
 * pasted before extraction would be the same. This lets the user mine those on demand from the Review
 * tab, so the queue isn't empty just because the mail arrived first.
 *
 * Idempotent: a source that already has ANY item is skipped, so re-running never double-counts.
 * L0 suggest-only (hard rule #5): everything the extractor inserts lands at status='review'.
 */

const SCAN_LIMIT = 200; // newest sources to consider per click
const MINE_CAP = 60; // hard cap on how many un-mined sources we actually run the model over per click

export type BackfillResult = { scanned: number; inserted: number; remaining: number };

export async function backfillExtraction(supabase: SupabaseClient, userId: string): Promise<BackfillResult> {
  // Sources that can carry action items: emails and pasted meeting transcripts.
  const { data: srcRows } = await supabase
    .from("sources")
    .select("id, title, raw_text, occurred_at, source_type")
    .eq("user_id", userId)
    .in("source_type", ["email", "meeting"])
    .order("occurred_at", { ascending: false })
    .limit(SCAN_LIMIT);
  const sources = srcRows ?? [];
  if (!sources.length) return { scanned: 0, inserted: 0, remaining: 0 };

  // Which sources already produced items? Skip them, never mine the same source twice.
  const { data: itemRows } = await supabase
    .from("items")
    .select("source_id")
    .eq("user_id", userId)
    .not("source_id", "is", null);
  const mined = new Set((itemRows ?? []).map((r) => r.source_id as string));

  const unmined = sources.filter((s) => !mined.has(s.id as string));
  const batch = unmined.slice(0, MINE_CAP);
  if (!batch.length) return { scanned: 0, inserted: 0, remaining: 0 };

  // The extractor's prompt differs for an email vs a meeting transcript, so split by kind.
  const toShape = (s: (typeof batch)[number]) => ({
    id: s.id as string,
    title: (s.title as string | null) ?? null,
    body: (s.raw_text as string | null) ?? "",
    occurredAt: (s.occurred_at as string | null) ?? null,
  });
  const emails = batch.filter((s) => s.source_type === "email").map(toShape);
  const meetings = batch.filter((s) => s.source_type === "meeting").map(toShape);

  let inserted = 0;
  if (emails.length) inserted += await extractItemsFromSources(supabase, userId, emails, 4, "email");
  if (meetings.length) inserted += await extractItemsFromSources(supabase, userId, meetings, 4, "meeting");

  return { scanned: batch.length, inserted, remaining: Math.max(0, unmined.length - batch.length) };
}
