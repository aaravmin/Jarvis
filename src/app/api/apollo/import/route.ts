import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apolloEnabled, apolloMatchPerson } from "@/lib/apollo";

export const dynamic = "force-dynamic";

type ImportPerson = { id?: string; fullName?: string; company?: string; roleTitle?: string; email?: string; linkedin?: string };

/**
 * POST /api/apollo/import, add Apollo-discovered people as contacts. Body: { people: ImportPerson[] }.
 * User-initiated, so created_by 'user' + review_status 'accepted' (no jarvis provenance gate). Apollo
 * is still recorded as the email's source in field_sources for transparency (hard rule #3). RLS scopes
 * every insert to the caller's own rows.
 *
 * Apollo's people SEARCH never returns emails, so for each selected person we ENRICH (match by Apollo
 * id) at import time to reveal their work email, that's what makes "import a discovered person" yield
 * an actual address rather than a name with no contact info.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { people?: ImportPerson[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const people = (body.people ?? []).filter((p) => (p.fullName ?? "").trim().length >= 2);
  if (!people.length) return NextResponse.json({ error: "No valid people to import." }, { status: 400 });

  const canEnrich = apolloEnabled();
  let imported = 0;
  for (const p of people) {
    const linkedin = p.linkedin?.trim();
    // Search gives us no email, enrich now (precise match by Apollo id, name/company/LinkedIn as
    // fallback) to reveal one. emailStatus drives the confidence we record.
    let email = p.email?.trim() || undefined;
    let emailStatus: string | undefined;
    if (!email && canEnrich) {
      const match = await apolloMatchPerson({ id: p.id, name: p.fullName, company: p.company, linkedinUrl: linkedin });
      email = match?.email;
      emailStatus = match?.emailStatus;
    }
    const fieldSources: Record<string, unknown> = {};
    if (email) {
      fieldSources.email = {
        url: "https://apollo.io",
        quote: `Found via Apollo.io people search${emailStatus ? ` (email status: ${emailStatus})` : ""}`,
        confidence: emailStatus === "verified" ? 0.9 : 0.7,
      };
    }
    const { data: contact, error } = await supabase
      .from("contacts")
      .insert({
        user_id: user.id,
        full_name: p.fullName!.trim(),
        company: p.company?.trim() || null,
        role_title: p.roleTitle?.trim() || null,
        field_sources: fieldSources,
        created_by: "user",
        review_status: "accepted",
      })
      .select("id")
      .single();
    if (error || !contact) continue; // skip a row that failed to insert rather than abort the batch

    const channels: { contact_id: string; kind: string; value: string; is_primary: boolean }[] = [];
    if (email) channels.push({ contact_id: contact.id, kind: "email", value: email, is_primary: true });
    if (linkedin) channels.push({ contact_id: contact.id, kind: "linkedin", value: linkedin, is_primary: !email });
    if (channels.length) await supabase.from("contact_channels").insert(channels);
    imported++;
  }

  return NextResponse.json({ imported });
}
