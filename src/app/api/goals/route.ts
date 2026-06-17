import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Goal } from "@/lib/goals/types";

export const dynamic = "force-dynamic";

/** GET /api/goals — list the signed-in user's goals (newest first). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data } = await supabase
    .from("goals")
    .select("id, title, description, created_at")
    .order("created_at", { ascending: false });
  const goals: Goal[] = (data ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description ?? undefined,
    createdAt: g.created_at,
  }));
  return NextResponse.json({ goals });
}

/** POST /api/goals — create a goal manually. Body: { title, description? }. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { title?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const title = (body.title ?? "").trim();
  if (title.length < 2) return NextResponse.json({ error: "Give the goal a title." }, { status: 400 });

  const { data, error } = await supabase
    .from("goals")
    .insert({ user_id: user.id, title, description: body.description?.trim() || null })
    .select("id, title, description, created_at")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not create goal." }, { status: 500 });

  const goal: Goal = {
    id: data.id,
    title: data.title,
    description: data.description ?? undefined,
    createdAt: data.created_at,
  };
  return NextResponse.json({ goal });
}
