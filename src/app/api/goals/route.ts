import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Goal } from "@/lib/goals/types";

export const dynamic = "force-dynamic";

/** Postgres "undefined column" — migration 0022 (parent_goal_id) not applied yet. */
const UNDEFINED_COLUMN = "42703";

/** GET /api/goals, list the signed-in user's goals (newest first). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const withParent = await supabase
    .from("goals")
    .select("id, title, description, created_at, parent_goal_id")
    .order("created_at", { ascending: false });
  const data =
    withParent.error?.code === UNDEFINED_COLUMN
      ? (
          await supabase
            .from("goals")
            .select("id, title, description, created_at")
            .order("created_at", { ascending: false })
        ).data
      : withParent.data;

  const goals: Goal[] = (data ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description ?? undefined,
    createdAt: g.created_at,
    parentGoalId: (g as { parent_goal_id?: string | null }).parent_goal_id ?? null,
  }));
  return NextResponse.json({ goals });
}

/** POST /api/goals, create a goal manually. Body: { title, description?, parentGoalId? }. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { title?: string; description?: string; parentGoalId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (title.length < 2) return NextResponse.json({ error: "Give the goal a title." }, { status: 400 });
  const parentGoalId = body.parentGoalId?.trim() || null;

  let warning: string | undefined;
  let insert = await supabase
    .from("goals")
    .insert({ user_id: user.id, title, description: body.description?.trim() || null, parent_goal_id: parentGoalId })
    .select("id, title, description, created_at, parent_goal_id")
    .single();

  if (insert.error?.code === UNDEFINED_COLUMN && parentGoalId) {
    // Migration 0022 not applied yet: fall back to a top-level goal instead of failing outright, and
    // say so clearly rather than silently dropping the requested sub-goal relationship.
    warning =
      "Sub-goals are not enabled yet (migration 0022_goal_hierarchy.sql needs to be applied). Added as a top-level goal instead.";
    insert = await supabase
      .from("goals")
      .insert({ user_id: user.id, title, description: body.description?.trim() || null })
      .select("id, title, description, created_at")
      .single();
  }

  if (insert.error || !insert.data) {
    return NextResponse.json({ error: insert.error?.message ?? "Could not create goal." }, { status: 500 });
  }

  const goal: Goal = {
    id: insert.data.id,
    title: insert.data.title,
    description: insert.data.description ?? undefined,
    createdAt: insert.data.created_at,
    parentGoalId: (insert.data as { parent_goal_id?: string | null }).parent_goal_id ?? null,
  };
  return NextResponse.json({ goal, warning });
}
