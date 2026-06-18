import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rowsToPerson,
  type ContactRow,
  type ChannelRow,
  type GoalLinkRow,
} from "@/lib/research/map";
import type { DiscoveredPerson, ResearchRunView } from "@/lib/research/types";

const CONTACT_COLS =
  "id, full_name, company, role_title, background, relevance, the_ask, notes, source_quote, confidence, review_status, outreach_status, field_sources";

async function attachChildren(
  supabase: SupabaseClient,
  contactRows: ContactRow[],
): Promise<DiscoveredPerson[]> {
  const ids = contactRows.map((c) => c.id);
  let channels: ChannelRow[] = [];
  let goalLinks: GoalLinkRow[] = [];
  if (ids.length) {
    const { data: ch } = await supabase
      .from("contact_channels")
      .select("contact_id, kind, value, is_primary")
      .in("contact_id", ids);
    channels = (ch ?? []) as unknown as ChannelRow[];
    const { data: gl } = await supabase
      .from("contact_goals")
      .select("contact_id, goal_id, rationale, confidence")
      .in("contact_id", ids);
    goalLinks = (gl ?? []) as unknown as GoalLinkRow[];
  }
  return contactRows.map((c) => rowsToPerson(c, channels, goalLinks));
}

/** Accepted, provenanced people for the People tab (RLS scopes to the signed-in user). */
export async function loadAcceptedPeople(supabase: SupabaseClient): Promise<DiscoveredPerson[]> {
  const { data } = await supabase
    .from("contacts")
    .select(CONTACT_COLS)
    .eq("review_status", "accepted")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as ContactRow[];
  const people = await attachChildren(supabase, rows);
  // Only contacts that carry a source quote render via the provenance <Card>. Manual (user-created)
  // contacts without provenance arrive with P6-T1 and get their own non-Card UI then.
  return people.filter((p) => p.sourceQuote);
}

/** Research runs that still have people awaiting review (or errored), newest first. */
export async function loadReviewRuns(supabase: SupabaseClient): Promise<ResearchRunView[]> {
  const { data: runs } = await supabase
    .from("research_runs")
    .select("id, query, target_kind, status, result_count, error, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const views: ResearchRunView[] = [];
  for (const run of runs ?? []) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select(CONTACT_COLS)
      .eq("research_run_id", run.id)
      .eq("review_status", "review")
      .order("created_at", { ascending: true });
    const rows = (contacts ?? []) as unknown as ContactRow[];
    const people = await attachChildren(supabase, rows);
    // Keep: runs with people to review, errored runs, and just-finished runs (even with 0 results,
    // so the "no verifiable matches" card explains the outcome instead of a bare empty queue).
    const ageMs = Date.now() - new Date(run.created_at).getTime();
    const recentlyDone = run.status === "done" && ageMs < 10 * 60 * 1000;
    if (people.length === 0 && run.status !== "error" && !recentlyDone) continue;
    views.push({
      id: run.id,
      query: run.query,
      targetKind: "people",
      status: run.status,
      resultCount: run.result_count,
      error: run.error ?? undefined,
      createdAt: run.created_at,
      people,
    });
  }
  return views;
}
