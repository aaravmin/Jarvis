import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshIntersection } from "@/lib/goals/links";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/items, act on a review-queue item. Body: { id, action: "accept" | "dismiss" }.
 *   accept  → status='accepted' (graduates out of Review; tasks then appear on the Tasks page).
 *   dismiss → status='dismissed'.
 * This is the L0 approve/reject loop (hard rule #5). RLS scopes the row to the signed-in user.
 *
 * ONE-APPROVAL FLOW: an item may carry review-status goal_links the extractor proposed. Acting on the
 * item acts on those links in the same handler, accepting the item accepts its goal tags, dismissing
 * dismisses them. So the user approves an item and its goal relevance together, in one click.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

  const status = body.action === "accept" ? "accepted" : body.action === "dismiss" ? "dismissed" : null;
  if (!status) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const { data: updated, error } = await supabase
    .from("items")
    .update({ status })
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("status", "review") // only act on something still in the queue (idempotent, race-safe)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only mirror the decision onto the goal links when THIS call is what graduated the item out of
  // review (0 rows = already accepted/dismissed elsewhere), so we never reopen a settled decision.
  if ((updated ?? []).length > 0) {
    const linkStatus = status === "accepted" ? "accepted" : "dismissed";
    await supabase
      .from("goal_links")
      .update({ review_status: linkStatus })
      .eq("user_id", user.id)
      .eq("entity_type", "item")
      .eq("entity_id", id)
      .eq("review_status", "review");
    // Recompute the item's intersection from its now-accepted links (no-op on dismiss).
    await refreshIntersection(supabase, user.id, "item", id);
  }

  return NextResponse.json({ ok: true, status });
}
