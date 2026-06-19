import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/items — act on a review-queue item. Body: { id, action: "accept" | "dismiss" }.
 *   accept  → status='accepted' (graduates out of Review; tasks then appear on the Tasks page).
 *   dismiss → status='dismissed'.
 * This is the L0 approve/reject loop (hard rule #5). RLS scopes the row to the signed-in user.
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

  const { error } = await supabase
    .from("items")
    .update({ status })
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("status", "review"); // only act on something still in the queue (idempotent, race-safe)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
