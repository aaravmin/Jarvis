import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routeTask } from "@/lib/agents/router";
import { agentMeta } from "@/lib/agents/registry";
import { runOpportunitySearch } from "@/lib/agents/opportunity/run";
import { runApplication } from "@/lib/agents/application/run";
import { runPeopleSearch } from "@/lib/research/run";
import { backfillExtraction } from "@/lib/items/backfill";
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
 *   • application           → read a form URL and build a field plan (Apply tab)
 *   • email                 → mine synced Gmail into action items, land them in Review
 *   • assistant             → answer inline (web search + local files + connected data; also creates
 *                             calendar events and drafts email via its write tools)
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

  if (decision.agent === "application") {
    // The agent needs a form URL. Pull the first http(s) link out of the request; if there isn't one,
    // route correctly but point the user at the Apply tab instead of guessing.
    const url = (message.match(/https?:\/\/[^\s<>"')]+/i)?.[0] ?? "").replace(/[.,]+$/, "");
    if (!url) {
      const result: AgentDispatchResult = {
        decision,
        outcome: "done",
        redirectTo: "/apply",
        message: "Paste the application link on the Apply tab and Jarvis will read the form and fill it from your documents.",
      };
      return NextResponse.json(result);
    }
    const lower = `${message} ${url}`.toLowerCase();
    const kind = /grant|fellowship|scholarship|research|funding/.test(lower)
      ? "grant"
      : /job|intern|career|greenhouse|lever|workday|ashby/.test(lower)
        ? "job"
        : "other";
    const r = await runApplication(supabase, user.id, { targetUrl: url, kind });
    const result: AgentDispatchResult =
      r.status === "error"
        ? { decision, outcome: "error", runId: r.runId, error: r.error }
        : r.status === "reused"
          ? { decision, outcome: "done", runId: r.runId, redirectTo: "/apply", message: "That application is already being prepared — see Apply." }
          : {
              decision,
              outcome: "done",
              runId: r.view.id,
              resultCount: r.view.fieldPlan.length,
              redirectTo: "/apply",
              message: r.view.summary,
            };
    return NextResponse.json(result);
  }

  if (decision.agent === "email") {
    // "Turn my inbox into tasks" — mine already-synced mail into the Review queue (the same engine the
    // Scan button uses). Each click processes a bounded batch and reports how much is left.
    try {
      const { scanned, inserted, remaining } = await backfillExtraction(supabase, user.id);
      const message =
        inserted > 0
          ? `Found ${inserted} action item${inserted === 1 ? "" : "s"} in ${scanned} message${scanned === 1 ? "" : "s"} — review them now.${remaining ? ` ${remaining} more to scan.` : ""}`
          : scanned > 0
            ? `Scanned ${scanned} message${scanned === 1 ? "" : "s"} — nothing actionable.${remaining ? ` ${remaining} more to scan.` : ""}`
            : "No un-scanned email left. Sync new mail on the Email tab, then ask again.";
      const result: AgentDispatchResult = {
        decision,
        outcome: "done",
        resultCount: inserted,
        redirectTo: inserted > 0 ? "/review" : "/email",
        message,
      };
      return NextResponse.json(result);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Couldn't mine your inbox.";
      return NextResponse.json({ decision, outcome: "error", error } satisfies AgentDispatchResult);
    }
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
