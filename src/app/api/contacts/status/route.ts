import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_OUTREACH_STATUSES, type ContactOutreachStatus } from "@/lib/research/types";

const VALID = new Set<string>(CONTACT_OUTREACH_STATUSES.map((s) => s.value));

/**
 * Set a contact's outreach status (not_emailed → emailed → spoke → follow_up).
 * Manual, user-driven; RLS scopes the update to the signed-in user's rows.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { contactId?: string; outreachStatus?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { contactId, outreachStatus } = body;
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required." }, { status: 400 });
  }
  if (!outreachStatus || !VALID.has(outreachStatus)) {
    return NextResponse.json({ error: "Invalid outreachStatus." }, { status: 400 });
  }

  const { error } = await supabase
    .from("contacts")
    .update({ outreach_status: outreachStatus })
    .eq("id", contactId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, outreachStatus: outreachStatus as ContactOutreachStatus });
}
