import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entityFacts, loadGoalDigests } from "@/lib/goals/facts";
import { proposeGoalLinks } from "@/lib/goals/generate";
import { linkEntityToGoal } from "@/lib/goals/links";
import type { GoalEntityType } from "@/lib/goals/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPES: GoalEntityType[] = ["contact", "opportunity", "item", "source"];

/**
 * POST /api/entities/suggest-goals, { entityType, entityId }. Claude proposes which of the user's
 * goals this entity advances; each proposal lands as a review_status='review' goal link (L0).
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

  const facts = await entityFacts(supabase, entityType, body.entityId);
  if (!facts) return NextResponse.json({ error: "Entity not found." }, { status: 404 });

  const goals = await loadGoalDigests(supabase);
  if (!goals.length) {
    return NextResponse.json({ created: 0, message: "No goals yet, create some first." });
  }

  const proposals = await proposeGoalLinks(facts.facts, goals);
  let created = 0;
  for (const p of proposals) {
    const res = await linkEntityToGoal(supabase, user.id, {
      goalId: p.goalId,
      entityType,
      entityId: body.entityId,
      rationale: p.rationale,
      confidence: p.confidence,
      createdBy: "jarvis",
      reviewStatus: "review", // L0, user approves on the goal page / Review
    });
    if (res.ok) created++;
  }
  return NextResponse.json({ created });
}
