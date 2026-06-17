import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateGoalsFromContext } from "@/lib/goals/generate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/goals/generate — { context }. Claude turns freeform context into suggested goals. They
 * land review_status='review' (L0) with the context as their source, for the user to accept.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const context = (body.context ?? "").trim();
  if (context.length < 10) return NextResponse.json({ error: "Give a sentence or two of context." }, { status: 400 });

  try {
    const goals = await generateGoalsFromContext(context);
    if (!goals.length) return NextResponse.json({ created: 0, goals: [] });

    const { data: source } = await supabase
      .from("sources")
      .insert({ user_id: user.id, source_type: "manual", title: "Goal context", occurred_at: new Date().toISOString(), raw_text: context })
      .select("id")
      .single();
    const sourceId = (source?.id as string | undefined) ?? null;

    const rows = goals.map((g) => ({
      user_id: user.id,
      title: g.title,
      description: g.description ?? null,
      created_by: "jarvis",
      review_status: "review",
      source_id: sourceId,
      source_quote: (g.rationale ?? context).slice(0, 500),
      confidence: g.confidence ?? null,
    }));
    const { data: inserted } = await supabase.from("goals").insert(rows).select("id, title, description");
    return NextResponse.json({ created: inserted?.length ?? 0, goals: inserted ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed." }, { status: 500 });
  }
}
