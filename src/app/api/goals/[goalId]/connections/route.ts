import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateGoalConnection, type GoalDigest } from "@/lib/goals/generate";
import type { GoalEntityType } from "@/lib/goals/types";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/goals/[goalId]/connections — find other goals that SHARE an accepted entity with this
 * goal, and for each, generate "how to intersect them" guidance. Connections are factual (shared
 * overlap) so they're stored accepted; the rationale is the AI enrichment.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // All accepted links (RLS-scoped to this user). Small for a personal app — compute overlaps in JS.
  const { data: links } = await supabase
    .from("goal_links")
    .select("goal_id, entity_type, entity_id")
    .eq("review_status", "accepted");
  const all = links ?? [];

  const key = (t: string, id: string) => `${t}:${id}`;
  const myEntities = new Set(all.filter((l) => l.goal_id === goalId).map((l) => key(l.entity_type, l.entity_id)));
  if (!myEntities.size) return NextResponse.json({ created: 0, message: "This goal has no linked entities yet." });

  // other goal -> shared entity refs
  const shared = new Map<string, { type: GoalEntityType; id: string }[]>();
  for (const l of all) {
    if (l.goal_id === goalId) continue;
    if (myEntities.has(key(l.entity_type, l.entity_id))) {
      const arr = shared.get(l.goal_id) ?? [];
      arr.push({ type: l.entity_type as GoalEntityType, id: l.entity_id });
      shared.set(l.goal_id, arr);
    }
  }
  if (!shared.size) return NextResponse.json({ created: 0, message: "No other goal shares an entity with this one yet." });

  // Resolve goal titles + shared entity labels.
  const goalIds = [goalId, ...shared.keys()];
  const { data: goalRows } = await supabase.from("goals").select("id, title, description").in("id", goalIds);
  const gmap = new Map<string, GoalDigest>();
  for (const g of goalRows ?? []) gmap.set(g.id, { id: g.id, title: g.title, description: g.description ?? undefined });
  const me = gmap.get(goalId);
  if (!me) return NextResponse.json({ error: "Goal not found." }, { status: 404 });

  const labelFor = await buildLabelResolver(supabase, [...shared.values()].flat());

  let created = 0;
  for (const [otherId, ents] of shared) {
    const other = gmap.get(otherId);
    if (!other) continue;
    const [a, b] = goalId < otherId ? [goalId, otherId] : [otherId, goalId];
    const labels = ents.map((e) => labelFor(e.type, e.id)).filter(Boolean) as string[];
    const rationale = await generateGoalConnection(me, other, labels);
    const { error } = await supabase.from("goal_connections").upsert(
      {
        user_id: user.id,
        goal_a: a,
        goal_b: b,
        rationale: rationale ?? null,
        shared_count: ents.length,
        created_by: "jarvis",
        review_status: "accepted",
      },
      { onConflict: "goal_a,goal_b" },
    );
    if (!error) created++;
  }
  return NextResponse.json({ created });
}

/** Build a (type,id) -> label lookup for a set of entity refs (one query per table). */
async function buildLabelResolver(
  supabase: Awaited<ReturnType<typeof createClient>>,
  refs: { type: GoalEntityType; id: string }[],
): Promise<(type: GoalEntityType, id: string) => string | null> {
  const byType: Record<GoalEntityType, string[]> = { contact: [], opportunity: [], item: [], source: [] };
  for (const r of refs) if (!byType[r.type].includes(r.id)) byType[r.type].push(r.id);
  const map = new Map<string, string>();
  if (byType.contact.length) {
    const { data } = await supabase.from("contacts").select("id, full_name").in("id", byType.contact);
    for (const c of data ?? []) map.set(`contact:${c.id}`, c.full_name);
  }
  if (byType.opportunity.length) {
    const { data } = await supabase.from("opportunities").select("id, title").in("id", byType.opportunity);
    for (const o of data ?? []) map.set(`opportunity:${o.id}`, o.title);
  }
  if (byType.item.length) {
    const { data } = await supabase.from("items").select("id, title").in("id", byType.item);
    for (const it of data ?? []) map.set(`item:${it.id}`, it.title);
  }
  if (byType.source.length) {
    const { data } = await supabase.from("sources").select("id, title, source_type").in("id", byType.source);
    for (const s of data ?? []) map.set(`source:${s.id}`, s.title ?? s.source_type);
  }
  return (type, id) => map.get(`${type}:${id}`) ?? null;
}
