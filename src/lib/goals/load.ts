import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Goal, GoalEntityType } from "@/lib/goals/types";

/** A goal plus rolled-up counts for the Goals list. */
export type GoalSummary = Goal & {
  reviewStatus: "review" | "accepted" | "dismissed";
  createdBy: "user" | "jarvis";
  linkCount: number;
  countsByType: Record<GoalEntityType, number>;
  intersectionCount: number;
};

export type LinkedEntity = {
  linkId: string;
  entityType: GoalEntityType;
  entityId: string;
  label: string;
  sublabel?: string;
  href?: string;
  rationale?: string;
  confidence?: number;
  reviewStatus: "review" | "accepted" | "dismissed";
};

export type IntersectionView = {
  entityType: GoalEntityType;
  entityId: string;
  label: string;
  sublabel?: string;
  goals: { id: string; title: string }[];
  suggestion?: string;
};

export type ConnectionView = {
  id: string;
  otherGoalId: string;
  otherGoalTitle: string;
  rationale?: string;
  sharedCount: number;
  reviewStatus: "review" | "accepted" | "dismissed";
};

export type GoalDetail = {
  goal: GoalSummary;
  entities: LinkedEntity[];
  intersections: IntersectionView[];
  connections: ConnectionView[];
};

const EMPTY_COUNTS: Record<GoalEntityType, number> = { contact: 0, opportunity: 0, item: 0, source: 0 };

type Ref = { entityType: GoalEntityType; entityId: string };

/** Batch-resolve display labels for a set of polymorphic entity refs (one query per table). */
async function resolveLabels(
  supabase: SupabaseClient,
  refs: Ref[],
): Promise<Map<string, { label: string; sublabel?: string; href?: string }>> {
  const byType: Record<GoalEntityType, string[]> = { contact: [], opportunity: [], item: [], source: [] };
  for (const r of refs) if (!byType[r.entityType].includes(r.entityId)) byType[r.entityType].push(r.entityId);
  const map = new Map<string, { label: string; sublabel?: string; href?: string }>();

  if (byType.contact.length) {
    const { data } = await supabase.from("contacts").select("id, full_name, company").in("id", byType.contact);
    for (const c of data ?? []) map.set(`contact:${c.id}`, { label: c.full_name, sublabel: c.company ?? undefined });
  }
  if (byType.opportunity.length) {
    const { data } = await supabase.from("opportunities").select("id, title, organization").in("id", byType.opportunity);
    for (const o of data ?? []) map.set(`opportunity:${o.id}`, { label: o.title, sublabel: o.organization ?? undefined });
  }
  if (byType.item.length) {
    const { data } = await supabase.from("items").select("id, title, item_type").in("id", byType.item);
    for (const it of data ?? []) map.set(`item:${it.id}`, { label: it.title, sublabel: it.item_type, href: it.item_type === "event" ? "/calendar" : "/tasks" });
  }
  if (byType.source.length) {
    const { data } = await supabase.from("sources").select("id, title, source_type, permalink").in("id", byType.source);
    for (const s of data ?? []) map.set(`source:${s.id}`, { label: s.title ?? s.source_type, sublabel: s.source_type, href: s.permalink ?? undefined });
  }
  return map;
}

/** All goals + rolled-up accepted-link counts + intersection counts. */
export async function loadGoals(supabase: SupabaseClient): Promise<GoalSummary[]> {
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, description, created_at, review_status, created_by")
    .order("created_at", { ascending: false });
  const { data: links } = await supabase
    .from("goal_links")
    .select("goal_id, entity_type")
    .eq("review_status", "accepted");
  const { data: inters } = await supabase.from("goal_intersections").select("goal_ids");

  const counts = new Map<string, Record<GoalEntityType, number>>();
  for (const l of links ?? []) {
    const c = counts.get(l.goal_id) ?? { ...EMPTY_COUNTS };
    c[l.entity_type as GoalEntityType] += 1;
    counts.set(l.goal_id, c);
  }
  const interCount = new Map<string, number>();
  for (const row of inters ?? []) {
    for (const gid of (row.goal_ids as string[]) ?? []) interCount.set(gid, (interCount.get(gid) ?? 0) + 1);
  }

  return (goals ?? []).map((g) => {
    const c = counts.get(g.id) ?? { ...EMPTY_COUNTS };
    return {
      id: g.id,
      title: g.title,
      description: g.description ?? undefined,
      createdAt: g.created_at,
      reviewStatus: g.review_status,
      createdBy: g.created_by,
      linkCount: c.contact + c.opportunity + c.item + c.source,
      countsByType: c,
      intersectionCount: interCount.get(g.id) ?? 0,
    };
  });
}

/** A goal's accepted entity_ids of one type, the per-tab filter primitive. */
export async function entityIdsForGoal(
  supabase: SupabaseClient,
  goalId: string,
  entityType: GoalEntityType,
): Promise<string[]> {
  const { data } = await supabase
    .from("goal_links")
    .select("entity_id")
    .eq("goal_id", goalId)
    .eq("entity_type", entityType)
    .eq("review_status", "accepted");
  return (data ?? []).map((r) => r.entity_id as string);
}

/** Which goals each given entity serves (accepted links), for "serves N goals" badges. */
export async function goalsForEntities(
  supabase: SupabaseClient,
  entityType: GoalEntityType,
  entityIds: string[],
): Promise<Map<string, { id: string; title: string }[]>> {
  const out = new Map<string, { id: string; title: string }[]>();
  if (!entityIds.length) return out;
  const { data } = await supabase
    .from("goal_links")
    .select("entity_id, goal_id, goals(title)")
    .eq("entity_type", entityType)
    .in("entity_id", entityIds)
    .eq("review_status", "accepted");
  for (const r of (data ?? []) as unknown as { entity_id: string; goal_id: string; goals: { title: string } | null }[]) {
    const arr = out.get(r.entity_id) ?? [];
    arr.push({ id: r.goal_id, title: r.goals?.title ?? "Goal" });
    out.set(r.entity_id, arr);
  }
  return out;
}

/** Full detail for one goal: linked entities (accepted+review), its entities' intersections, connections. */
export async function loadGoalDetail(supabase: SupabaseClient, goalId: string): Promise<GoalDetail | null> {
  const { data: g } = await supabase
    .from("goals")
    .select("id, title, description, created_at, review_status, created_by")
    .eq("id", goalId)
    .maybeSingle();
  if (!g) return null;

  const { data: linkRows } = await supabase
    .from("goal_links")
    .select("id, entity_type, entity_id, rationale, confidence, review_status")
    .eq("goal_id", goalId)
    .in("review_status", ["review", "accepted"])
    .order("created_at", { ascending: true });
  const refs: Ref[] = (linkRows ?? []).map((r) => ({ entityType: r.entity_type as GoalEntityType, entityId: r.entity_id as string }));
  const labels = await resolveLabels(supabase, refs);
  const entities: LinkedEntity[] = (linkRows ?? []).map((r) => {
    const key = `${r.entity_type}:${r.entity_id}`;
    const meta = labels.get(key);
    return {
      linkId: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      label: meta?.label ?? "(removed)",
      sublabel: meta?.sublabel,
      href: meta?.href,
      rationale: r.rationale ?? undefined,
      confidence: r.confidence ?? undefined,
      reviewStatus: r.review_status,
    };
  });

  // Intersections whose goal set includes this goal.
  const { data: interRows } = await supabase
    .from("goal_intersections")
    .select("entity_type, entity_id, goal_ids, suggestion")
    .contains("goal_ids", [goalId]);
  const interRefs: Ref[] = (interRows ?? []).map((r) => ({ entityType: r.entity_type as GoalEntityType, entityId: r.entity_id as string }));
  const interLabels = await resolveLabels(supabase, interRefs);
  // Resolve goal titles for the intersection goal sets.
  const allGoalIds = Array.from(new Set((interRows ?? []).flatMap((r) => (r.goal_ids as string[]) ?? [])));
  const goalTitle = new Map<string, string>();
  if (allGoalIds.length) {
    const { data: gs } = await supabase.from("goals").select("id, title").in("id", allGoalIds);
    for (const x of gs ?? []) goalTitle.set(x.id, x.title);
  }
  const intersections: IntersectionView[] = (interRows ?? []).map((r) => {
    const meta = interLabels.get(`${r.entity_type}:${r.entity_id}`);
    return {
      entityType: r.entity_type,
      entityId: r.entity_id,
      label: meta?.label ?? "(removed)",
      sublabel: meta?.sublabel,
      goals: ((r.goal_ids as string[]) ?? []).map((id) => ({ id, title: goalTitle.get(id) ?? "Goal" })),
      suggestion: r.suggestion ?? undefined,
    };
  });

  // Goal-to-goal connections touching this goal.
  const { data: connRows } = await supabase
    .from("goal_connections")
    .select("id, goal_a, goal_b, rationale, shared_count, review_status")
    .or(`goal_a.eq.${goalId},goal_b.eq.${goalId}`);
  const otherIds = (connRows ?? []).map((c) => (c.goal_a === goalId ? c.goal_b : c.goal_a));
  const otherTitle = new Map<string, string>();
  if (otherIds.length) {
    const { data: gs } = await supabase.from("goals").select("id, title").in("id", otherIds);
    for (const x of gs ?? []) otherTitle.set(x.id, x.title);
  }
  const connections: ConnectionView[] = (connRows ?? []).map((c) => {
    const other = c.goal_a === goalId ? c.goal_b : c.goal_a;
    return {
      id: c.id,
      otherGoalId: other,
      otherGoalTitle: otherTitle.get(other) ?? "Goal",
      rationale: c.rationale ?? undefined,
      sharedCount: c.shared_count,
      reviewStatus: c.review_status,
    };
  });

  const c = entities.reduce(
    (acc, e) => {
      if (e.reviewStatus === "accepted") acc[e.entityType] += 1;
      return acc;
    },
    { ...EMPTY_COUNTS },
  );

  return {
    goal: {
      id: g.id,
      title: g.title,
      description: g.description ?? undefined,
      createdAt: g.created_at,
      reviewStatus: g.review_status,
      createdBy: g.created_by,
      linkCount: c.contact + c.opportunity + c.item + c.source,
      countsByType: c,
      intersectionCount: intersections.length,
    },
    entities,
    intersections,
    connections,
  };
}
