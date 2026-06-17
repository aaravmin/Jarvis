import type { AgentKind, AgentMeta } from "@/lib/agents/types";

/**
 * The agent registry — one entry per specialized agent. This is the single source of truth for what
 * each agent does, whether it can run today, and the routing guidance the classifier sees. Adding an
 * agent = a new entry here + a dispatch branch in /api/agent.
 */
export const AGENTS: Record<AgentKind, AgentMeta> = {
  opportunity: {
    kind: "opportunity",
    label: "Opportunity agent",
    tab: "Opportunities",
    blurb: "Finds programs, jobs, internships, hackathons, fellowships, grants and competitions, with deadlines, how to apply, requirements, location and required skills.",
    triggers: "find me biotech hackathons; summer fellowships for sophomores; new-grad SWE jobs in climate tech; YC-backed accelerators open now; scholarships for CS students.",
    status: "live",
  },
  contact: {
    kind: "contact",
    label: "Contact agent",
    tab: "Contacts",
    blurb: "Finds and researches real, named PEOPLE matching a cohort — alumni, founders, recruiters — with their role, background, why they matter, and how to reach them.",
    triggers: "find Brown alumni at YC biotech startups; recruiters hiring new grads at climate-tech firms; founders of seed-stage AI dev-tools companies in NYC.",
    status: "live",
  },
  email: {
    kind: "email",
    label: "Email agent",
    tab: "Email",
    blurb: "Triages your Gmail into sourced tasks, replies, and follow-ups, each linked back to the exact message.",
    triggers: "any new emails from my advisor?; what do I owe replies to?; turn my inbox into tasks; did I respond to the recruiter?",
    status: "needs-connection",
    unavailableHint:
      "The Email agent needs Gmail connected (read-only) via the Google OAuth client. See /docs/CONNECTORS.md to enable it.",
  },
  calendar: {
    kind: "calendar",
    label: "Calendar agent",
    tab: "Calendar",
    blurb: "Reads your calendar and proposes events from email/meetings; answers what's coming up.",
    triggers: "what's on my calendar tomorrow?; am I free Thursday afternoon?; add the interview to my calendar.",
    status: "needs-connection",
    unavailableHint:
      "The Calendar agent needs Google Calendar connected via the Google OAuth client. See /docs/CONNECTORS.md to enable it.",
  },
  meeting: {
    kind: "meeting",
    label: "Meeting agent",
    tab: "Meetings",
    blurb: "Turns a meeting transcript into sourced action items, each linked to the moment it was said.",
    triggers: "pull action items from this transcript; what did I commit to in the standup?; summarize this meeting into tasks.",
    status: "paste",
    unavailableHint:
      "The Meeting agent works from a pasted transcript. Paste one on the Meetings tab and it will extract the commitments. Live capture comes later.",
  },
  assistant: {
    kind: "assistant",
    label: "Jarvis assistant",
    tab: "Jarvis",
    blurb: "General questions: searches the web for current facts and reads your local files. The catch-all when no specialized agent fits.",
    triggers: "search up the latest on X; what's the weather; read my fineprint folder; explain this file; anything not about the agents above.",
    status: "live",
  },
};

export const AGENT_KINDS = Object.keys(AGENTS) as AgentKind[];

export function agentMeta(kind: AgentKind): AgentMeta {
  return AGENTS[kind];
}
