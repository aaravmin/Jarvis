import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoalEntityType } from "@/lib/goals/types";

/**
 * Goal-link mutations + deterministic intersection maintenance. A link anchors any entity to a goal.
 * Whenever an entity's ACCEPTED links change, we recompute its intersection record (entity serving 2+
 * goals) in pure SQL — the LLM never decides WHETHER an intersection exists, only fills the combined-ask.
 */

/** Recompute the goal_intersections row for one entity from its accepted goal_links. */
export async function refreshIntersection(
  supabase: SupabaseClient,
  userId: string,
  entityType: GoalEntityType,
  entityId: string,
): Promise<void> {
  const { data } = await supabase
    .from("goal_links")
    .select("goal_id")
    .eq("user_id", userId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("review_status", "accepted");
  const goalIds = (data ?? []).map((r) => r.goal_id as string);

  if (goalIds.length >= 2) {
    // Upsert the goal set. We don't touch `suggestion` here so any existing combined-ask survives;
    // it's regenerated on demand when the goal set changes.
    await supabase
      .from("goal_intersections")
      .upsert(
        { user_id: userId, entity_type: entityType, entity_id: entityId, goal_ids: goalIds, created_by: "jarvis" },
        { onConflict: "entity_type,entity_id" },
      );
  } else {
    await supabase
      .from("goal_intersections")
      .delete()
      .eq("user_id", userId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
  }
}

export type LinkInput = {
  goalId: string;
  entityType: GoalEntityType;
  entityId: string;
  rationale?: string;
  confidence?: number;
  createdBy?: "user" | "jarvis";
  reviewStatus?: "review" | "accepted" | "dismissed";
};

/** Create (or no-op if it exists) a goal link, then refresh the entity's intersection if accepted. */
export async function linkEntityToGoal(
  supabase: SupabaseClient,
  userId: string,
  input: LinkInput,
): Promise<{ ok: boolean; error?: string }> {
  const reviewStatus = input.reviewStatus ?? "accepted";
  const { error } = await supabase.from("goal_links").insert({
    user_id: userId,
    goal_id: input.goalId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    rationale: input.rationale ?? null,
    confidence: input.confidence ?? null,
    created_by: input.createdBy ?? "user",
    review_status: reviewStatus,
  });
  // 23505 = already linked → treat as success (idempotent).
  if (error && error.code !== "23505") return { ok: false, error: error.message };
  if (reviewStatus === "accepted") await refreshIntersection(supabase, userId, input.entityType, input.entityId);
  return { ok: true };
}

/** Set a link's review status (accept/dismiss an AI suggestion), then refresh its intersection. */
export async function setLinkReview(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
  status: "accepted" | "dismissed",
): Promise<{ ok: boolean; error?: string }> {
  const { data: link } = await supabase
    .from("goal_links")
    .select("entity_type, entity_id")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { ok: false, error: "Link not found." }; // RLS-filtered or missing — don't fake success
  const { error } = await supabase.from("goal_links").update({ review_status: status }).eq("id", linkId);
  if (error) return { ok: false, error: error.message };
  await refreshIntersection(supabase, userId, link.entity_type as GoalEntityType, link.entity_id as string);
  return { ok: true };
}

/** Remove a link, then refresh the entity's intersection. */
export async function unlinkById(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data: link } = await supabase
    .from("goal_links")
    .select("entity_type, entity_id")
    .eq("id", linkId)
    .maybeSingle();
  if (!link) return { ok: false, error: "Link not found." };
  const { error } = await supabase.from("goal_links").delete().eq("id", linkId);
  if (error) return { ok: false, error: error.message };
  await refreshIntersection(supabase, userId, link.entity_type as GoalEntityType, link.entity_id as string);
  return { ok: true };
}
