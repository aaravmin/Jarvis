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

/**
 * DELETE /api/contacts?id=<contactId> — remove a contact and its channels. User-driven; RLS scopes
 * the delete to the signed-in user's own rows, so it can never touch another user's contacts.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  // Remove channels first — contact_channels.contact_id references contacts, so without a guaranteed
  // ON DELETE CASCADE deleting the contact while channels still reference it would fail.
  await supabase.from("contact_channels").delete().eq("contact_id", id);
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
