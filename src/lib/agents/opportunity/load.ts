import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToOpportunity, OPPORTUNITY_COLS, type OpportunityRow } from "@/lib/agents/opportunity/map";
import type { DiscoveredOpportunity, OpportunityRunView, OpportunityKindFilter } from "@/lib/agents/opportunity/types";

/** Accepted, provenanced opportunities for the Opportunities tab (RLS scopes to the signed-in user). */
export async function loadAcceptedOpportunities(
  supabase: SupabaseClient,
): Promise<DiscoveredOpportunity[]> {
  const { data } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_COLS)
    .eq("review_status", "accepted")
    // Soonest deadline first; rows without a resolved deadline sort last.
    .order("deadline_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as OpportunityRow[];
  // Only rows that carry a source quote render via the provenance <Card>.
  return rows.map(rowToOpportunity).filter((o) => o.sourceQuote);
}

/** Opportunity runs that still have items awaiting review (or errored), newest first. */
export async function loadOpportunityReviewRuns(
  supabase: SupabaseClient,
): Promise<OpportunityRunView[]> {
  const { data: runs } = await supabase
    .from("opportunity_runs")
    .select("id, query, kind_filter, status, result_count, error, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const views: OpportunityRunView[] = [];
  for (const run of runs ?? []) {
    const { data: opps } = await supabase
      .from("opportunities")
      .select(OPPORTUNITY_COLS)
      .eq("opportunity_run_id", run.id)
      .eq("review_status", "review")
      .order("created_at", { ascending: true });
    const rows = (opps ?? []) as unknown as OpportunityRow[];
    const opportunities = rows.map(rowToOpportunity);
    // Keep: runs with items to review, errored runs, and just-finished runs (even with 0 results, so
    // the "no verifiable matches" card explains the outcome instead of a bare empty queue).
    const ageMs = Date.now() - new Date(run.created_at).getTime();
    const recentlyDone = run.status === "done" && ageMs < 10 * 60 * 1000;
    if (opportunities.length === 0 && run.status !== "error" && !recentlyDone) continue;
    views.push({
      id: run.id,
      query: run.query,
      kindFilter: run.kind_filter as OpportunityKindFilter,
      status: run.status,
      resultCount: run.result_count,
      error: run.error ?? undefined,
      createdAt: run.created_at,
      opportunities,
    });
  }
  return views;
}
