import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPeopleResearch, type GoalDigest } from "@/lib/research/extract";
import { candidateToPerson } from "@/lib/research/map";
import type { DiscoveredPerson, ResearchRunView } from "@/lib/research/types";

// The Claude web_search call can take 30-90s. Run it server-side; tokens never touch the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/research — start (and, in v1, run to completion) a cohort research run.
 * Body: { target: 'people', query: string }. Returns the finished ResearchRunView.
 *
 * v1 is synchronous: the request resolves when the run is done. The research_runs row + the
 * GET /api/research/[runId] endpoint exist so this can move to a background worker + polling later
 * without changing the client contract.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { target?: string; query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const target = body.target ?? "people";
  const query = (body.query ?? "").trim();
  if (target !== "people") {
    return NextResponse.json({ error: `Unsupported research target: ${target}` }, { status: 400 });
  }
  if (query.length < 4) {
    return NextResponse.json({ error: "Describe who to find (a few words at least)." }, { status: 400 });
  }

  const STALE_MS = 120_000; // a synchronous run can't legitimately outlive maxDuration

  // Dedup guard: don't start a second identical run while one is already in flight. Self-heals if a
  // prior run got stuck 'running' (server died before finalizing) by treating stale rows as dead.
  const { data: existing } = await supabase
    .from("research_runs")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("target_kind", "people")
    .eq("query", query)
    .eq("status", "running")
    .maybeSingle();
  if (existing) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age < STALE_MS) {
      return NextResponse.json({ runId: existing.id, status: "running", reused: true });
    }
    await supabase
      .from("research_runs")
      .update({ status: "error", error: "Abandoned / timed out." })
      .eq("id", existing.id);
  }

  // Create the run. The partial unique index research_runs_one_inflight_idx is the real guard against
  // a concurrent duplicate that slipped past the SELECT above (the check-then-insert isn't atomic).
  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .insert({ user_id: user.id, query, target_kind: "people", status: "running" })
    .select("id")
    .single();
  if (runErr || !run) {
    if (runErr?.code === "23505") {
      // Unique violation: another request already started this exact run — reuse it.
      const { data: dup } = await supabase
        .from("research_runs")
        .select("id")
        .eq("user_id", user.id)
        .eq("target_kind", "people")
        .eq("query", query)
        .eq("status", "running")
        .maybeSingle();
      if (dup) return NextResponse.json({ runId: dup.id, status: "running", reused: true });
    }
    return NextResponse.json({ error: runErr?.message ?? "Could not create run." }, { status: 500 });
  }
  const runId = run.id as string;

  const { data: source } = await supabase
    .from("sources")
    .insert({
      user_id: user.id,
      source_type: "research",
      title: query,
      occurred_at: new Date().toISOString(),
      raw_text: `Research run started for: "${query}"`,
    })
    .select("id")
    .single();
  const sourceId = (source?.id as string | undefined) ?? null;
  if (sourceId) {
    await supabase.from("research_runs").update({ source_id: sourceId }).eq("id", runId);
  }

  try {
    // Load the user's goals so goal_links can reference real ids.
    const { data: goalRows } = await supabase
      .from("goals")
      .select("id, title")
      .eq("user_id", user.id);
    const goals: GoalDigest[] = (goalRows ?? []).map((g) => ({ id: g.id, title: g.title }));

    const outcome = await runPeopleResearch(query, goals);

    const people: DiscoveredPerson[] = [];
    for (const c of outcome.candidates) {
      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .insert({
          user_id: user.id,
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
      if (cErr || !contact) continue; // skip a row that failed the provenance check rather than abort the run
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

    // Finalize: fill the source's raw_text with the run digest, mark the run done.
    if (sourceId) {
      await supabase.from("sources").update({ raw_text: outcome.summary }).eq("id", sourceId);
    }
    await supabase
      .from("research_runs")
      .update({ status: "done", result_count: people.length })
      .eq("id", runId);

    const view: ResearchRunView = {
      id: runId,
      query,
      targetKind: "people",
      status: "done",
      resultCount: people.length,
      createdAt: new Date().toISOString(),
      people,
    };
    return NextResponse.json(view);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research failed.";
    await supabase.from("research_runs").update({ status: "error", error: message }).eq("id", runId);
    return NextResponse.json({ runId, status: "error", error: message }, { status: 500 });
  }
}
