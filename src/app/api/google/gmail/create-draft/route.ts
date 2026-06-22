import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTokenWithScope } from "@/lib/google/store";
import { SCOPE_GMAIL_COMPOSE } from "@/lib/google/oauth";
import { createDraft } from "@/lib/google/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/google/gmail/create-draft, { to?, subject, body }. Saves a DRAFT in the user's Gmail
 * (never sends, autonomy L0). Requires the gmail.compose scope; returns a friendly reconnect error
 * if the user connected before write scopes were added.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { to?: string; subject?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const subject = (body.subject ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!subject && !text) {
    return NextResponse.json({ error: "A subject or body is required to save a draft." }, { status: 400 });
  }

  try {
    const token = await getTokenWithScope(supabase, user.id, SCOPE_GMAIL_COMPOSE, "saving drafts to Gmail");
    const draft = await createDraft(token, { to: body.to?.trim() || undefined, subject: subject || "(no subject)", body: text });
    return NextResponse.json({ ok: true, draftId: draft.id, url: draft.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    console.error("gmail/create-draft failed:", msg);
    const userMsg = msg.startsWith("Reconnect Google") ? msg : "Could not save the draft. Try reconnecting Google.";
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
