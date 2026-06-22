import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entityFacts } from "@/lib/goals/facts";
import { generateCombinedAsk, type GoalDigest } from "@/lib/goals/generate";
import type { GoalEntityType } from "@/lib/goals/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES: GoalEntityType[] = ["contact", "opportunity", "item", "source"];

/**
 * POST /api/goal-intersections, { entityType, entityId }. For an entity that already serves 2+ goals
 * (detected deterministically), Claude writes ONE combined-ask covering all of them, stored as the
 * intersection's suggestion.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { entityType?: string; entityId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.entityId || !TYPES.includes(body.entityType as GoalEntityType)) {
    return NextResponse.json({ error: "entityType, entityId are required." }, { status: 400 });
  }
  const entityType = body.entityType as GoalEntityType;

  const { data: inter } = await supabase
    .from("goal_intersections")
    .select("goal_ids")
    .eq("user_id", user.id)
    .eq("entity_type", entityType)
    .eq("entity_id", body.entityId)
    .maybeSingle();
  if (!inter) return NextResponse.json({ error: "Not an intersection (entity serves < 2 goals)." }, { status: 404 });

  const facts = await entityFacts(supabase, entityType, body.entityId);
  if (!facts) return NextResponse.json({ error: "Entity not found." }, { status: 404 });

  const { data: gs } = await supabase.from("goals").select("id, title, description").in("id", inter.goal_ids as string[]);
  const goals: GoalDigest[] = (gs ?? []).map((g) => ({ id: g.id, title: g.title, description: g.description ?? undefined }));

  try {
    const suggestion = await generateCombinedAsk(facts.facts, goals);
    if (!suggestion) return NextResponse.json({ error: "No suggestion produced." }, { status: 500 });
    await supabase
      .from("goal_intersections")
      .update({ suggestion })
      .eq("user_id", user.id)
      .eq("entity_type", entityType)
      .eq("entity_id", body.entityId);
    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed." }, { status: 500 });
  }
}

/** DELETE /api/goal-intersections, { entityType, entityId }. Dismiss (clear) an intersection. */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  if (!entityId || !TYPES.includes(entityType as GoalEntityType)) {
    return NextResponse.json({ error: "entityType, entityId required." }, { status: 400 });
  }
  await supabase
    .from("goal_intersections")
    .delete()
    .eq("user_id", user.id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  return NextResponse.json({ ok: true });
}
