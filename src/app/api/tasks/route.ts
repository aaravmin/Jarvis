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
