import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runPeopleResearch, type GoalDigest } from "@/lib/research/extract";
import { candidateToPerson } from "@/lib/research/map";
import type { DiscoveredPerson, ResearchRunView } from "@/lib/research/types";

/**
 * Run-and-persist for the Contact (people) agent. Extracted from POST /api/research so both that
 * route AND the multi-agent router (/api/agent) drive people research through one path: dedup guard →
 * create run + source → research → persist each contact (+ channels + goal links) → finalize.
 *
 * Behavior is identical to the original inline route logic; it just lives here now. v1 is synchronous
 * (the request is the long-poll); the runs table + dedup index let it move to a worker later.
 */

const STALE_MS = 120_000; // a synchronous run can't legitimately outlive maxDuration

export type PeopleRunResult =
  | { status: "reused"; runId: string }
  | { status: "done"; view: ResearchRunView }
  | { status: "error"; runId: string; error: string };

export async function runPeopleSearch(
  supabase: SupabaseClient,
  userId: string,
  query: string,
): Promise<PeopleRunResult> {
  // Dedup guard: don't start a second identical run while one is in flight. Self-heals stale rows.
  const { data: existing } = await supabase
    .from("research_runs")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("target_kind", "people")
    .eq("query", query)
    .eq("status", "running")
    .maybeSingle();
  if (existing) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age < STALE_MS) return { status: "reused", runId: existing.id };
    await supabase
      .from("research_runs")
      .update({ status: "error", error: "Abandoned / timed out." })
      .eq("id", existing.id);
  }

  // The partial unique index research_runs_one_inflight_idx is the real guard against a concurrent
  // duplicate that slipped past the SELECT (the check-then-insert isn't atomic).
  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .insert({ user_id: userId, query, target_kind: "people", status: "running" })
    .select("id")
    .single();
  if (runErr || !run) {
    if (runErr?.code === "23505") {
      const { data: dup } = await supabase
        .from("research_runs")
        .select("id")
        .eq("user_id", userId)
        .eq("target_kind", "people")
        .eq("query", query)
        .eq("status", "running")
        .maybeSingle();
      if (dup) return { status: "reused", runId: dup.id };
    }
    throw new Error(runErr?.message ?? "Could not create run.");
  }
  const runId = run.id as string;
  const nowISO = new Date().toISOString();

  const { data: source } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      source_type: "research",
      title: query,
      occurred_at: nowISO,
      raw_text: `Research run started for: "${query}"`,
    })
    .select("id")
    .single();
  const sourceId = (source?.id as string | undefined) ?? null;
  if (sourceId) {
    await supabase.from("research_runs").update({ source_id: sourceId }).eq("id", runId);
  }

  try {
    const { data: goalRows } = await supabase.from("goals").select("id, title").eq("user_id", userId);
    const goals: GoalDigest[] = (goalRows ?? []).map((g) => ({ id: g.id, title: g.title }));

    const outcome = await runPeopleResearch(query, goals);

    const people: DiscoveredPerson[] = [];
    for (const c of outcome.candidates) {
      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .insert({
          user_id: userId,
          full_name: c.fullName,
          company: c.company ?? null,
          role_title: c.roleTitle ?? null,
          background: c.background ?? null,
          relevance: c.relevance ?? null,
          the_ask: c.theAsk ?? null,
          notes: c.notes ?? null,
          next_follow_up_at: null, // the model never sets dates
          field_sources: c.fieldSources,
          source_id: sourceId,
          source_quote: c.sourceQuote,
          confidence: c.confidence ?? null,
          review_status: "review",
          created_by: "jarvis",
          research_run_id: runId,
        })
        .select("id")
        .single();
      if (cErr || !contact) continue; // skip a row that failed the provenance check rather than abort
      const contactId = contact.id as string;

      if (c.channels.length) {
        await supabase.from("contact_channels").insert(
          c.channels.map((ch, i) => ({
            contact_id: contactId,
            kind: ch.kind,
            value: ch.value,
            is_primary: i === 0,
          })),
        );
      }
      if (c.goalLinks.length) {
        await supabase.from("contact_goals").insert(
          c.goalLinks.map((g) => ({
            contact_id: contactId,
            goal_id: g.goalId,
            rationale: g.rationale ?? null,
            confidence: g.confidence ?? null,
          })),
        );
      }

      people.push(candidateToPerson(contactId, c));
    }

    if (sourceId) {
      await supabase.from("sources").update({ raw_text: outcome.summary }).eq("id", sourceId);
    }
    await supabase
      .from("research_runs")
      .update({ status: "done", result_count: people.length })
      .eq("id", runId);

    return {
      status: "done",
      view: {
        id: runId,
        query,
        targetKind: "people",
        status: "done",
        resultCount: people.length,
        createdAt: nowISO,
        people,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Research failed.";
    await supabase.from("research_runs").update({ status: "error", error }).eq("id", runId);
    return { status: "error", runId, error };
  }
}
