import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshIntersection } from "@/lib/goals/links";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/items, act on one or many review-queue items.
 *   Body: { id, action } (single) OR { ids: string[], action } (bulk).
 *   accept  → status='accepted' (graduates out of Review; tasks then appear on the Tasks page).
 *   dismiss → status='dismissed'.
 * This is the L0 approve/reject loop (hard rule #5). RLS scopes every row to the signed-in user.
 *
 * ONE-APPROVAL FLOW: an item may carry review-status goal_links the extractor proposed. Acting on the
 * item acts on those links in the same handler, accepting the item accepts its goal tags, dismissing
 * dismisses them. So the user approves an item and its goal relevance together, in one click, whether
 * that click is a single card's button or the bulk bar.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const userId = user.id; // captured so it stays narrowed non-null inside the closure below

  let body: { id?: string; ids?: string[]; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const status = body.action === "accept" ? "accepted" : body.action === "dismiss" ? "dismissed" : null;
  if (!status) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const linkStatus = status === "accepted" ? "accepted" : "dismissed";

  // Mirror a status change onto the affected items' review-status goal_links (one-approval flow) and
  // recompute each one's intersection. Shared by both the single and bulk paths below.
  async function flipGoalLinks(ids: string[]) {
    if (!ids.length) return;
    await supabase
      .from("goal_links")
      .update({ review_status: linkStatus })
      .eq("user_id", userId)
      .eq("entity_type", "item")
      .in("entity_id", ids)
      .eq("review_status", "review");
    await Promise.all(ids.map((id) => refreshIntersection(supabase, userId, "item", id)));
  }

  // Bulk path: { ids, action }.
  if (Array.isArray(body.ids)) {
    const ids = body.ids.map((v) => String(v).trim()).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "Missing item ids." }, { status: 400 });

    const { data: updated, error } = await supabase
      .from("items")
      .update({ status })
      .eq("user_id", userId)
      .in("id", ids)
      .eq("status", "review") // only act on rows still in the queue (idempotent, race-safe)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const updatedIds = (updated ?? []).map((r) => r.id as string);
    await flipGoalLinks(updatedIds);

    return NextResponse.json({ updated: updatedIds.length });
  }

  // Single path (unchanged behavior + response shape).
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

  const { data: updated, error } = await supabase
    .from("items")
    .update({ status })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("status", "review") // only act on something still in the queue (idempotent, race-safe)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only mirror the decision onto the goal links when THIS call is what graduated the item out of
  // review (0 rows = already accepted/dismissed elsewhere), so we never reopen a settled decision.
  if ((updated ?? []).length > 0) await flipGoalLinks([id]);

  return NextResponse.json({ ok: true, status });
}
