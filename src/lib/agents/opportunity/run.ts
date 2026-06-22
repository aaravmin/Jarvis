import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runOpportunityResearch } from "@/lib/agents/opportunity/extract";
import { resolveDeadline, resolveDateRange } from "@/lib/agents/opportunity/deadline";
import { validatedToOpportunity } from "@/lib/agents/opportunity/map";
import { tavilySeedHints } from "@/lib/search/tavily";
import { loadGoalDigests } from "@/lib/goals/facts";
import { loadProfile, profileDigest } from "@/lib/profile";
import type {
  DiscoveredOpportunity,
  OpportunityKindFilter,
  OpportunityRunView,
} from "@/lib/agents/opportunity/types";

/** Build the "who is this for" context (profile + goals) that tunes a search to the user. */
async function relevanceContext(supabase: SupabaseClient): Promise<string | undefined> {
  const [profile, goals] = await Promise.all([loadProfile(supabase), loadGoalDigests(supabase)]);
  const parts: string[] = [];
  const pd = profileDigest(profile);
  if (pd) parts.push(pd);
  if (goals.length) parts.push(`Their goals:\n${goals.map((g) => `- ${g.title}${g.description ? `: ${g.description}` : ""}`).join("\n")}`);
  return parts.length ? parts.join("\n\n") : undefined;
}

/**
 * Run-and-persist for the Opportunity agent. Owns the full flow so both /api/opportunities (the page
 * bar) and /api/agent (the router) share one path: dedup guard → create run + source → research →
 * resolve dates deterministically (chrono) → persist each opportunity → finalize.
 *
 * v1 is synchronous (the request is the long-poll), mirroring the people research route. The runs
 * table + dedup index let this move to a background worker later without changing callers.
 */

const STALE_MS = 120_000; // a synchronous run can't legitimately outlive maxDuration

export type OpportunityRunResult =
  | { status: "reused"; runId: string }
  | { status: "done"; view: OpportunityRunView }
  | { status: "error"; runId: string; error: string };

export async function runOpportunitySearch(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  kindFilter: OpportunityKindFilter = "all",
): Promise<OpportunityRunResult> {
  // Dedup guard: don't start a second identical run while one is in flight. Self-heals if a prior run
  // got stuck 'running' (server died before finalizing) by treating stale rows as dead.
  const { data: existing } = await supabase
    .from("opportunity_runs")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("query", query)
    .eq("status", "running")
    .maybeSingle();
  if (existing) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age < STALE_MS) return { status: "reused", runId: existing.id };
    await supabase
      .from("opportunity_runs")
      .update({ status: "error", error: "Abandoned / timed out." })
      .eq("id", existing.id);
  }

  // Create the run. The partial unique index opportunity_runs_one_inflight_idx is the real guard
  // against a concurrent duplicate that slipped past the SELECT (the check-then-insert isn't atomic).
  const { data: run, error: runErr } = await supabase
    .from("opportunity_runs")
    .insert({ user_id: userId, query, kind_filter: kindFilter, status: "running" })
    .select("id")
    .single();
  if (runErr || !run) {
    if (runErr?.code === "23505") {
      const { data: dup } = await supabase
        .from("opportunity_runs")
        .select("id")
        .eq("user_id", userId)
        .eq("query", query)
        .eq("status", "running")
        .maybeSingle();
      if (dup) return { status: "reused", runId: dup.id };
    }
    throw new Error(runErr?.message ?? "Could not create opportunity run.");
  }
  const runId = run.id as string;

  // The reference instant for ALL date resolution in this run. Captured once so chrono resolves every
  // raw_deadline against the same "now", deterministic, and never touched by the model.
  const nowISO = new Date().toISOString();

  const { data: source } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      source_type: "research",
      title: query,
      occurred_at: nowISO,
      raw_text: `Opportunity search started for: "${query}"`,
    })
    .select("id")
    .single();
  const sourceId = (source?.id as string | undefined) ?? null;
  if (sourceId) {
    await supabase.from("opportunity_runs").update({ source_id: sourceId }).eq("id", runId);
  }

  try {
    // Optional recall boost: a preliminary Tavily search seeds candidate URLs into the agent's
    // context. No-op (returns []) when TAVILY_API_KEY is unset. Seeds never bypass the citation gate.
    const [seedHints, relevance] = await Promise.all([
      tavilySeedHints(query, kindFilter),
      relevanceContext(supabase),
    ]);

    const outcome = await runOpportunityResearch(query, kindFilter, seedHints, relevance);

    const opportunities: DiscoveredOpportunity[] = [];
    for (const v of outcome.opportunities) {
      // Resolve dates HERE, deterministically, the model only ever handed us raw strings.
      const deadlineAt = resolveDeadline(v.rawDeadline, nowISO);
      const { startsAt, endsAt } = resolveDateRange(v.rawEventDates, nowISO);

      const { data: inserted, error: insErr } = await supabase
        .from("opportunities")
        .insert({
          user_id: userId,
          title: v.title,
          organization: v.organization ?? null,
          category: v.category,
          description: v.description ?? null,
          location: v.location ?? null,
          is_remote: v.isRemote ?? null,
          how_to_apply_url: v.howToApplyUrl ?? null,
          requirements: v.requirements ?? null,
          required_skills: v.requiredSkills.length ? v.requiredSkills : null,
          comp_or_prize: v.compOrPrize ?? null,
          notes: v.notes ?? null,
          raw_deadline: v.rawDeadline ?? null,
          deadline_at: deadlineAt ?? null,
          raw_event_dates: v.rawEventDates ?? null,
          starts_at: startsAt ?? null,
          ends_at: endsAt ?? null,
          field_sources: v.fieldSources,
          source_id: sourceId,
          source_quote: v.sourceQuote,
          confidence: v.confidence ?? null,
          review_status: "review",
          created_by: "jarvis",
          opportunity_run_id: runId,
        })
        .select("id")
        .single();
      if (insErr || !inserted) continue; // skip a row that failed the provenance check rather than abort
      opportunities.push(validatedToOpportunity(inserted.id as string, v, { deadlineAt, startsAt, endsAt }));
    }

    if (sourceId) {
      await supabase.from("sources").update({ raw_text: outcome.summary }).eq("id", sourceId);
    }
    await supabase
      .from("opportunity_runs")
      .update({ status: "done", result_count: opportunities.length })
      .eq("id", runId);

    return {
      status: "done",
      view: {
        id: runId,
        query,
        kindFilter,
        status: "done",
        resultCount: opportunities.length,
        createdAt: nowISO,
        opportunities,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Opportunity search failed.";
    await supabase.from("opportunity_runs").update({ status: "error", error }).eq("id", runId);
    return { status: "error", runId, error };
  }
}
