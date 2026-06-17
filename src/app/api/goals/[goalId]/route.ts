import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** PATCH /api/goals/[goalId] — rename / re-describe. Body: { title?, description? }. */
export async function PATCH(request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { title?: string; description?: string; reviewStatus?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const patch: { title?: string; description?: string | null; review_status?: string } = {};
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (t.length < 2) return NextResponse.json({ error: "Title too short." }, { status: 400 });
    patch.title = t;
  }
  if (typeof body.description === "string") patch.description = body.description.trim() || null;
  if (body.reviewStatus === "accepted" || body.reviewStatus === "dismissed") patch.review_status = body.reviewStatus;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { error } = await supabase.from("goals").update(patch).eq("id", goalId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/goals/[goalId] — remove a goal (its links cascade). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { error } = await supabase.from("goals").delete().eq("id", goalId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
