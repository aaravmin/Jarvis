import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-contacts and named email batches. When Jarvis drafts an email to someone, we ensure a contact
 * card exists for that recipient. A round of drafts can be saved as a named batch (the contacts drafted
 * to), and when the user says they sent it, every contact in the batch is advanced to "emailed". All
 * RLS-scoped to the signed-in user.
 */

type ContactWithChannels = { id: string; full_name: string; contact_channels?: { kind: string; value: string }[] };

/** The user's contact whose email channel matches (case-insensitive), or null. */
async function findContactByEmail(supabase: SupabaseClient, userId: string, email: string): Promise<string | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const { data } = await supabase.from("contacts").select("id, full_name, contact_channels(kind, value)").eq("user_id", userId);
  for (const c of (data ?? []) as ContactWithChannels[]) {
    for (const ch of c.contact_channels ?? []) {
      if (ch.kind === "email" && (ch.value ?? "").trim().toLowerCase() === e) return c.id;
    }
  }
  return null;
}

/** The user's contact whose name loosely matches, or null. */
async function findContactByName(supabase: SupabaseClient, userId: string, name: string): Promise<string | null> {
  const n = name.trim();
  if (n.length < 2) return null;
  const safe = n.replace(/[%_]/g, (c) => `\\${c}`);
  const { data } = await supabase.from("contacts").select("id").eq("user_id", userId).ilike("full_name", `%${safe}%`).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

/**
 * Find or create a contact for an email recipient. Returns the contact id (or null if we have nothing to
 * go on). A newly created one is a plain "added by you" contact (name + email), enrich it later.
 */
export async function upsertContactByRecipient(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  email: string | null,
): Promise<string | null> {
  const e = (email ?? "").trim();
  if (e) {
    const existing = await findContactByEmail(supabase, userId, e);
    if (existing) return existing;
  }
  const fullName = (name || (e ? e.split("@")[0].replace(/[._-]+/g, " ").trim() : "")).trim();
  if (!fullName && !e) return null;
  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({ user_id: userId, full_name: fullName || e, created_by: "user", review_status: "accepted" })
    .select("id")
    .single();
  if (error || !contact) return null;
  if (e) await supabase.from("contact_channels").insert({ contact_id: contact.id, kind: "email", value: e, is_primary: true });
  return contact.id as string;
}

/** Parse "Name <email>" or a bare email/name into {name, email}. */
export function parseRecipient(raw: string): { name: string; email: string | null } {
  const s = (raw ?? "").trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim().replace(/^["']|["']$/g, ""), email: m[2].trim() };
  if (s.includes("@")) return { name: "", email: s };
  return { name: s, email: null };
}

/**
 * Save a named batch from the people just drafted to (names or "Name <email>" or emails). Resolves each
 * to a contact, creating one when a recipient email is new. Returns the saved name + member count.
 */
export async function saveBatch(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  recipients: string[],
): Promise<{ name: string; count: number }> {
  const ids: string[] = [];
  for (const raw of recipients) {
    const { name: rName, email } = parseRecipient(raw);
    let id: string | null = null;
    if (email) id = (await findContactByEmail(supabase, userId, email)) ?? (await upsertContactByRecipient(supabase, userId, rName, email));
    else if (rName) id = await findContactByName(supabase, userId, rName);
    if (id && !ids.includes(id)) ids.push(id);
  }
  const batchName = name.trim() || "Untitled batch";
  await supabase.from("email_batches").insert({ user_id: userId, name: batchName, contact_ids: ids });
  return { name: batchName, count: ids.length };
}

/**
 * Mark a named batch sent: advance every contact in it to "emailed" (never downgrading a more advanced
 * status like spoke/follow_up). Matches the most recent batch whose name contains the given text.
 */
export async function markBatchSent(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<{ name: string; updated: number; found: boolean }> {
  const n = name.trim();
  const safe = n.replace(/[%_]/g, (c) => `\\${c}`);
  const { data: batches } = await supabase
    .from("email_batches")
    .select("id, name, contact_ids")
    .eq("user_id", userId)
    .ilike("name", `%${safe}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  const batch = batches?.[0] as { id: string; name: string; contact_ids: string[] } | undefined;
  if (!batch) return { name: n, updated: 0, found: false };

  const ids = batch.contact_ids ?? [];
  let updated = 0;
  if (ids.length) {
    const { data: upd } = await supabase
      .from("contacts")
      .update({ outreach_status: "emailed" })
      .in("id", ids)
      .not("outreach_status", "in", "(spoke,follow_up)")
      .select("id");
    updated = upd?.length ?? 0;
  }
  await supabase.from("email_batches").update({ status: "sent" }).eq("id", batch.id);
  return { name: batch.name, updated, found: true };
}
