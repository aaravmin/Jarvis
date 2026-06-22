import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTokenWithScope } from "@/lib/google/store";
import { SCOPE_GMAIL_COMPOSE } from "@/lib/google/oauth";
import { createDraft } from "@/lib/google/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/outreach/:id/gmail, save this outreach run's draft into the user's Gmail Drafts.
 * Body (optional): { to, subject, body } to override the stored draft (after the user edits it).
 * Never sends (autonomy L0). Requires gmail.compose; records the gmail_draft_id back on the run.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing outreach id." }, { status: 400 });

  let body: { to?: string; subject?: string; body?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* body is optional, fall back to the stored draft */
  }

  const { data: run } = await supabase
    .from("outreach_runs")
    .select("id, draft_subject, draft_body, contact_id")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "That draft no longer exists." }, { status: 404 });

  const subject = (body.subject ?? run.draft_subject ?? "").trim();
  const text = (body.body ?? run.draft_body ?? "").trim();
  if (!subject && !text) {
    return NextResponse.json({ error: "Nothing to save, draft the email first." }, { status: 400 });
  }

  // Resolve the recipient: explicit override, else the contact's primary email.
  let to = body.to?.trim();
  if (!to && run.contact_id) {
    const { data: channels } = await supabase
      .from("contact_channels")
      .select("kind, value, is_primary")
      .eq("contact_id", run.contact_id);
    const emails = (channels ?? []).filter((c) => c.kind === "email");
    to = (emails.find((e) => e.is_primary) ?? emails[0])?.value;
  }

  try {
    const token = await getTokenWithScope(supabase, user.id, SCOPE_GMAIL_COMPOSE, "saving drafts to Gmail");
    const draft = await createDraft(token, { to: to || undefined, subject: subject || "(no subject)", body: text });
    await supabase
      .from("outreach_runs")
      .update({ gmail_draft_id: draft.id, status: "saved", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("id", id);
    return NextResponse.json({ ok: true, draftId: draft.id, url: draft.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    console.error("outreach gmail draft failed:", msg);
    const userMsg = msg.startsWith("Reconnect Google") ? msg : "Could not save the draft. Try reconnecting Google.";
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
