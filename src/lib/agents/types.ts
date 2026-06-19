/**
 * Shared types for Jarvis's multi-agent system.
 *
 * The design goal (the user's ask): a single request is CLASSIFIED and routed to exactly ONE
 * specialized agent — we never run all agents in conjunction for every task. The router decides; the
 * registry describes what each agent does and whether it can run yet; /api/agent dispatches.
 */

import type { AskActionRef, AskCitation, AskFileRef } from "@/lib/assistant/types";

export type AgentKind =
  | "opportunity" // find programs / jobs / hackathons (LIVE)
  | "contact" // find/research people (LIVE — the people agent)
  | "application" // prepare a job/grant application from a link (LIVE — fills, never submits)
  | "email" // triage Gmail (needs Google connection)
  | "calendar" // read/plan calendar (needs Google connection)
  | "meeting" // transcript → action items (paste a transcript)
  | "assistant"; // general ask: web search + read local files (LIVE — the orb brain)

/** Can the agent actually run right now? */
export type AgentStatus = "live" | "needs-connection" | "paste";

/** Static metadata for an agent. The blurb + triggers are also fed to the router as routing guidance. */
export type AgentMeta = {
  kind: AgentKind;
  label: string; // "Opportunity agent"
  tab?: string; // nav tab it powers
  blurb: string; // what it does (one line)
  triggers: string; // example phrasings, to disambiguate routing
  status: AgentStatus;
  /** Shown to the user when status !== 'live' (why it can't run yet + how to enable). */
  unavailableHint?: string;
};

/** The router's decision: exactly one agent, plus a cleaned query and its reasoning. */
export type RouteDecision = {
  agent: AgentKind;
  normalizedQuery: string; // the task, stripped of "hey jarvis"/"find me"/etc.
  reason: string; // one sentence: why this agent
  confidence: number; // 0..1
};

/** The unified result of POST /api/agent. `decision` is always present so the UI can show the route. */
export type AgentDispatchResult = {
  decision: RouteDecision;
  outcome:
    | "done" // a research agent finished; results in Review (see runId/resultCount/redirectTo)
    | "answer" // the assistant answered inline (see answer)
    | "needs-connection" // routed correctly but the agent isn't connected yet (see message)
    | "paste" // routed correctly but needs pasted input (see message)
    | "error";
  runId?: string;
  resultCount?: number;
  redirectTo?: string; // where the client should navigate to see results, e.g. "/review"
  answer?: string; // assistant inline answer
  citations?: AskCitation[]; // web sources behind an "answer" outcome
  files?: AskFileRef[]; // local files the assistant read for an "answer" outcome
  actions?: AskActionRef[]; // things the assistant DID (event/draft/template) for an "answer" outcome
  message?: string; // human-facing explanation (needs-connection / paste)
  error?: string;
};
