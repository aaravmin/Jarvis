import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apolloEnabled, apolloMatchPerson } from "@/lib/apollo";

export const dynamic = "force-dynamic";

/**
 * POST /api/contacts/find-email, find a person's work email via Apollo.io.
 * Body: { contactId?, fullName, company?, domain?, linkedin? }.
 *   • Always returns { email, found, title?, organization? } (email null when not found).
 *   • When contactId is given, also saves the email as that contact's primary email channel and
 *     records Apollo as the source in field_sources (hard rule #3). RLS scopes the write to the
 *     caller's own row.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!apolloEnabled()) return NextResponse.json({ error: "Apollo.io isn't configured (set APOLLO_API_KEY)." }, { status: 503 });

  let body: { contactId?: string; fullName?: string; company?: string; domain?: string; linkedin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const fullName = (body.fullName ?? "").trim();
  const linkedin = (body.linkedin ?? "").trim();
  if (fullName.length < 2 && !linkedin) return NextResponse.json({ error: "A name or LinkedIn URL is required." }, { status: 400 });

  const match = await apolloMatchPerson({
    name: fullName || undefined,
    company: body.company?.trim() || undefined,
    domain: body.domain?.trim() || undefined,
    linkedinUrl: linkedin || undefined,
  });
  const email = match?.email ?? null;
  // `matched` distinguishes "Apollo found the person but the email is locked/missing" from "Apollo has
  // no record of them", so the UI can tell the user whether Apollo is working at all.
  if (!email) return NextResponse.json({ email: null, found: false, matched: Boolean(match) });

  // Persist onto an existing contact (RLS scopes the read + writes to the caller's own row).
  if (body.contactId) {
    const id = body.contactId;
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, field_sources, contact_channels(kind, value)")
      .eq("id", id)
      .single();
    if (existing) {
      const fieldSources = {
        ...((existing.field_sources as Record<string, unknown> | null) ?? {}),
        email: {
          // Apollo is the source of the EMAIL, its provenance URL is apollo.io, not the person's
          // LinkedIn (that's a separate channel). Mislabeling it would misattribute where the fact came from.
          url: "https://apollo.io",
          quote: `Found via Apollo.io (email status: ${match?.emailStatus ?? "match"})`,
          confidence: match?.emailStatus === "verified" ? 0.9 : 0.7,
        },
      };
      await supabase.from("contacts").update({ field_sources: fieldSources }).eq("id", id);
      // Upsert the primary email channel. Insert FIRST, then prune any other email rows, so a failed
      // write never leaves the contact with no email at all (the old non-atomic delete-then-insert could).
      const channels = (existing as { contact_channels?: { kind: string; value: string }[] }).contact_channels ?? [];
      const already = channels.some((c) => c.kind === "email" && c.value === email);
      if (!already) {
        const { error: insErr } = await supabase
          .from("contact_channels")
          .insert({ contact_id: id, kind: "email", value: email, is_primary: true });
        if (!insErr) {
          await supabase.from("contact_channels").delete().eq("contact_id", id).eq("kind", "email").neq("value", email);
        }
      }
    }
  }

  return NextResponse.json({ email, found: true, title: match?.title ?? null, organization: match?.organization ?? null });
}
