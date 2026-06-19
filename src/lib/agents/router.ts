import "server-only";
import { geminiStructured } from "@/lib/llm/gemini";
import { AGENTS, AGENT_KINDS } from "@/lib/agents/registry";
import type { AgentKind, RouteDecision } from "@/lib/agents/types";

/**
 * The intent router. Classifies one free-text request into exactly ONE agent so we never run all of
 * them in conjunction. A cheap forced-JSON classification on Gemini Flash — fast, and it shouldn't
 * burn the heavier reasoning the research agents use.
 *
 * Safe by construction: any failure (no key, refusal, malformed output, unknown agent) falls back to
 * the 'assistant' agent, which is the general catch-all and always available.
 */

const ROUTE_TOOL = {
  name: "route_task",
  description: "Choose the single best agent to handle the user's request and normalize the query for it.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      agent: {
        type: "string",
        enum: AGENT_KINDS,
        description: "The one agent best suited to this request.",
      },
      normalized_query: {
        type: "string",
        description:
          "The actionable task for that agent, stripped of filler like 'hey jarvis' or 'can you find me'. Keep the user's meaning.",
      },
      reason: { type: "string", description: "One short sentence: why this agent." },
      confidence: { type: "number", description: "0..1 confidence in this routing." },
    },
    required: ["agent", "normalized_query", "reason", "confidence"],
  },
};

function buildSystem(): string {
  const catalog = AGENT_KINDS.map((k) => {
    const a = AGENTS[k];
    return `- ${k}: ${a.blurb}\n    e.g. ${a.triggers}`;
  }).join("\n");
  return `You are Jarvis's task router. Pick the SINGLE best agent for the user's request — never more than one.

Agents:
${catalog}

Guidance:
- "find/research PEOPLE (alumni, founders, recruiters, named individuals)" → contact.
- "find programs / jobs / internships / hackathons / fellowships / grants / scholarships / competitions" → opportunity.
- "prepare / fill out / start / help me with an APPLICATION" AND the request contains a URL (a job posting or grant form link) → application. (If they want to FIND opportunities, that's opportunity, not application.)
- QUESTIONS about the user's own data — their inbox, schedule, meetings, tasks, contacts, or what's on their plate ("what's on my calendar", "did X email me?", "what do I owe a reply to?", "what should I do today?") → assistant. The assistant can read their connected Gmail/Calendar/meetings/tasks and answer.
- Route to email/calendar/meeting ONLY when the user wants an ACTION those agents perform: email = triage the inbox INTO tasks; calendar = create/propose calendar events; meeting = extract tasks from a pasted transcript.
- Anything general (web facts, reading local files, chit-chat, or no clear fit) → assistant.
Normalize the query to the actionable task. Always return a confidence.`;
}

function clampConfidence(n: unknown): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** The assistant fallback decision, used whenever routing can't be trusted. */
function fallback(message: string, reason: string): RouteDecision {
  return { agent: "assistant", normalizedQuery: message.trim(), reason, confidence: 0.3 };
}

export async function routeTask(message: string): Promise<RouteDecision> {
  const trimmed = (message ?? "").trim();
  if (!trimmed) return fallback("", "Empty request.");

  try {
    const input = await geminiStructured<{
      agent?: string;
      normalized_query?: string;
      reason?: string;
      confidence?: number;
    }>({
      system: buildSystem(),
      user: trimmed,
      schema: ROUTE_TOOL.input_schema,
      maxTokens: 512,
    });
    if (!input) return fallback(trimmed, "Router returned no decision; using the general assistant.");

    const agent = (AGENT_KINDS as string[]).includes(input.agent ?? "")
      ? (input.agent as AgentKind)
      : "assistant";
    const normalizedQuery = (input.normalized_query ?? "").trim() || trimmed;

    return {
      agent,
      normalizedQuery,
      reason: (input.reason ?? "").trim() || "Routed by intent.",
      confidence: clampConfidence(input.confidence),
    };
  } catch {
    return fallback(trimmed, "Routing failed; using the general assistant.");
  }
}
