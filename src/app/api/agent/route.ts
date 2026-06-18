import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routeTask } from "@/lib/agents/router";
import { agentMeta } from "@/lib/agents/registry";
import { runOpportunitySearch } from "@/lib/agents/opportunity/run";
import { runPeopleSearch } from "@/lib/research/run";
import { ask } from "@/lib/assistant/ask";
import { buildAskDataContext, type AskDataContext } from "@/lib/assistant/data-tools";
import type { AgentDispatchResult } from "@/lib/agents/types";

// Research agents call Claude web_search (30-90s); the router adds a quick classification first.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/agent — the multi-agent entry point. Classifies one free-text request and dispatches it
 * to exactly ONE specialized agent (never all of them):
 *   • opportunity / contact → run the research engine, results land in Review
 *   • assistant             → answer inline (web search + local files)
 *   • email / calendar      → routed correctly, but not connected yet (Google OAuth) → guidance
 *   • meeting               → needs a pasted transcript → guidance
 * Body: { message: string }. Returns an AgentDispatchResult that always includes the routing decision.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (message.length < 2) {
    return NextResponse.json({ error: "Say what you'd like Jarvis to do." }, { status: 400 });
  }

  const decision = await routeTask(message);
  const meta = agentMeta(decision.agent);
  const query = decision.normalizedQuery || message;

  // Agents that aren't runnable yet: route correctly, then explain how to enable them.
  if (meta.status !== "live") {
    const result: AgentDispatchResult = {
      decision,
      outcome: meta.status === "paste" ? "paste" : "needs-connection",
      message: meta.unavailableHint ?? `${meta.label} isn't available yet.`,
    };
    return NextResponse.json(result);
  }

  if (decision.agent === "opportunity") {
    const r = await runOpportunitySearch(supabase, user.id, query);
    const result: AgentDispatchResult =
      r.status === "error"
        ? { decision, outcome: "error", runId: r.runId, error: r.error }
        : r.status === "reused"
          ? { decision, outcome: "done", runId: r.runId, redirectTo: "/review", message: "A matching search is already running — see Review." }
          : { decision, outcome: "done", runId: r.view.id, resultCount: r.view.resultCount, redirectTo: "/review" };
    return NextResponse.json(result);
  }

  if (decision.agent === "contact") {
    const r = await runPeopleSearch(supabase, user.id, query);
    const result: AgentDispatchResult =
      r.status === "error"
        ? { decision, outcome: "error", runId: r.runId, error: r.error }
        : r.status === "reused"
          ? { decision, outcome: "done", runId: r.runId, redirectTo: "/review", message: "A matching search is already running — see Review." }
          : { decision, outcome: "done", runId: r.view.id, resultCount: r.view.resultCount, redirectTo: "/review" };
    return NextResponse.json(result);
  }

  // assistant — answer inline (the orb brain: web search + local files + the user's connected data).
  try {
    let dataCtx: AskDataContext | undefined;
    try {
      dataCtx = await buildAskDataContext(supabase, user.id);
    } catch {
      dataCtx = undefined;
    }
    const answer = await ask(query, dataCtx);
    const result: AgentDispatchResult = {
      decision,
      outcome: "answer",
      answer: answer.answer,
      citations: answer.citations,
      files: answer.files,
      actions: answer.actions,
    };
    return NextResponse.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : "The assistant failed.";
    return NextResponse.json({ decision, outcome: "error", error } satisfies AgentDispatchResult);
  }
}
