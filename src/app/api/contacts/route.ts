import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/contacts — manually add a contact. Body: { fullName, company?, roleTitle?, email?,
 * linkedin?, notes? }. User-created → accepted (no provenance needed).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { fullName?: string; company?: string; roleTitle?: string; email?: string; linkedin?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const fullName = (body.fullName ?? "").trim();
  if (fullName.length < 2) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      user_id: user.id,
      full_name: fullName,
      company: body.company?.trim() || null,
      role_title: body.roleTitle?.trim() || null,
      notes: body.notes?.trim() || null,
      created_by: "user",
      review_status: "accepted",
    })
    .select("id")
    .single();
  if (error || !contact) return NextResponse.json({ error: error?.message ?? "Could not add." }, { status: 500 });

  const channels: { contact_id: string; kind: string; value: string; is_primary: boolean }[] = [];
  if (body.email?.trim()) channels.push({ contact_id: contact.id, kind: "email", value: body.email.trim(), is_primary: true });
  if (body.linkedin?.trim()) channels.push({ contact_id: contact.id, kind: "linkedin", value: body.linkedin.trim(), is_primary: !body.email });
  if (channels.length) await supabase.from("contact_channels").insert(channels);

  return NextResponse.json({ id: contact.id });
}
