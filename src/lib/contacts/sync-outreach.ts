import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContactOutreachStatus } from "@/lib/research/types";

export type OutreachSyncResult = { updated: number; scanned: number };

/**
 * Deterministically advance contact outreach status from ingested inbound email. If a contact's email
 * address appears as the sender of any ingested email source, there is a real correspondence thread
 * with them, so we move them forward to "spoke" — but only from not_emailed/emailed, never overwriting
 * a more-advanced manual value (spoke/follow_up). No LLM involved; this is pure string matching, so it
 * honors HARD RULE #7 (don't trust the model with "did I reply?" facts) and "manual wins".
 */
export async function syncOutreachFromEmail(supabase: SupabaseClient): Promise<OutreachSyncResult> {
  // 1. Sender addresses from ingested email sources.
  const { data: emailSources } = await supabase
    .from("sources")
    .select("from_email")
    .eq("source_type", "email")
    .not("from_email", "is", null);
  const senders = new Set<string>();
  for (const s of emailSources ?? []) {
    const e = (s as { from_email: string | null }).from_email;
    if (e) senders.add(e.trim().toLowerCase());
  }
  if (senders.size === 0) return { updated: 0, scanned: 0 };

  // 2. Accepted contacts + their email channels.
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, outreach_status")
    .eq("review_status", "accepted");
  const rows = (contacts ?? []) as { id: string; outreach_status: ContactOutreachStatus | null }[];
  if (rows.length === 0) return { updated: 0, scanned: 0 };

  const ids = rows.map((r) => r.id);
  const { data: channels } = await supabase
    .from("contact_channels")
    .select("contact_id, value")
    .in("contact_id", ids)
    .eq("kind", "email");
  const emailByContact = new Map<string, string[]>();
  for (const ch of channels ?? []) {
    const c = ch as { contact_id: string; value: string };
    const list = emailByContact.get(c.contact_id) ?? [];
    list.push(c.value.trim().toLowerCase());
    emailByContact.set(c.contact_id, list);
  }

  // 3. Advance matches (monotonic: only not_emailed/emailed → spoke).
  let updated = 0;
  for (const r of rows) {
    const current = r.outreach_status ?? "not_emailed";
    if (current !== "not_emailed" && current !== "emailed") continue; // never clobber spoke/follow_up
    const emails = emailByContact.get(r.id) ?? [];
    const corresponded = emails.some((e) => senders.has(e));
    if (!corresponded) continue;
    const { error } = await supabase
      .from("contacts")
      .update({ outreach_status: "spoke" })
      .eq("id", r.id);
    if (!error) updated++;
  }
  return { updated, scanned: rows.length };
}
