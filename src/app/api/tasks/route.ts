import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDeadline } from "@/lib/agents/opportunity/deadline";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks — manually add a task. Body: { title, rawDue?, notes? }. The due date is resolved
 * deterministically by chrono (hard rule #2), never trusted from free text as a timestamp.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { title?: string; rawDue?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (title.length < 2) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  const dueAt = resolveDeadline(body.rawDue, new Date().toISOString()) ?? null;

  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      item_type: "task",
      title,
      due_at: dueAt,
      status: "accepted",
      reasoning: body.notes?.trim() || null,
      created_by: "user",
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not add." }, { status: 500 });
  return NextResponse.json({ id: data.id, dueAt });
}

/**
 * PATCH /api/tasks — complete or edit a task. Body: { id, status?, title?, rawDue?, notes? }.
 *   status: "done" | "accepted"  → check off / un-check.
 *   title / notes                → edit text.
 *   rawDue                       → re-resolve the due date with chrono (hard rule #2); "" clears it.
 * RLS scopes the row to the signed-in user; we also pin item_type='task' defensively.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { id?: string; status?: string; title?: string; rawDue?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing task id." }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.status === "done" || body.status === "accepted") update.status = body.status;
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (title.length < 2) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    update.title = title;
  }
  if (typeof body.notes === "string") update.reasoning = body.notes.trim() || null;
  if (typeof body.rawDue === "string") {
    update.due_at = body.rawDue.trim()
      ? resolveDeadline(body.rawDue, new Date().toISOString()) ?? null
      : null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await supabase
    .from("items")
    .update(update)
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("item_type", "task");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dueAt: update.due_at });
}

/** DELETE /api/tasks — remove a task. Body: { id }. RLS scopes to the user. */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing task id." }, { status: 400 });

  const { error } = await supabase
    .from("items")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id)
    .eq("item_type", "task");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
