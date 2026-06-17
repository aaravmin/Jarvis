import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unlinkById, setLinkReview } from "@/lib/goals/links";

export const dynamic = "force-dynamic";

/** PATCH /api/goal-links/[linkId] — accept/dismiss an AI-suggested link. Body: { action }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.action !== "accept" && body.action !== "dismiss") {
    return NextResponse.json({ error: "action must be accept or dismiss." }, { status: 400 });
  }
  const res = await setLinkReview(supabase, user.id, linkId, body.action === "accept" ? "accepted" : "dismissed");
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/goal-links/[linkId] — unlink. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ linkId: string }> }) {
  const { linkId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const res = await unlinkById(supabase, user.id, linkId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
