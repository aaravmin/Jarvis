import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { linkEntityToGoal } from "@/lib/goals/links";
import type { GoalEntityType } from "@/lib/goals/types";

export const dynamic = "force-dynamic";

const TYPES: GoalEntityType[] = ["contact", "opportunity", "item", "source"];

/**
 * POST /api/goal-links, manually anchor an entity to a goal.
 * Body: { goalId, entityType, entityId, rationale? }. User-initiated links are accepted immediately.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { goalId?: string; entityType?: string; entityId?: string; rationale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.goalId || !body.entityId || !TYPES.includes(body.entityType as GoalEntityType)) {
    return NextResponse.json({ error: "goalId, entityType, entityId are required." }, { status: 400 });
  }

  // Verify the GOAL belongs to the user (RLS also enforces this; this gives a clean 404).
  const { data: ownGoal } = await supabase.from("goals").select("id").eq("id", body.goalId).maybeSingle();
  if (!ownGoal) return NextResponse.json({ error: "Goal not found." }, { status: 404 });

  // Verify the entity belongs to the user (entity_id is polymorphic, no FK, so check ownership here).
  const table = { contact: "contacts", opportunity: "opportunities", item: "items", source: "sources" }[
    body.entityType as GoalEntityType
  ];
  const { data: owned } = await supabase.from(table).select("id").eq("id", body.entityId).maybeSingle();
  if (!owned) return NextResponse.json({ error: "Entity not found." }, { status: 404 });

  const res = await linkEntityToGoal(supabase, user.id, {
    goalId: body.goalId,
    entityType: body.entityType as GoalEntityType,
    entityId: body.entityId,
    rationale: body.rationale?.trim() || undefined,
    createdBy: "user",
    reviewStatus: "accepted",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
