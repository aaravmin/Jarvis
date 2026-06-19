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
  application: {
    kind: "application",
    label: "Application agent",
    tab: "Apply",
    blurb: "Prepares a JOB or GRANT application from a link you give it: reads the form and fills every field it can ground in your saved documents (resume, grant materials). It NEVER submits — you review the field plan and submit yourself. Needs an application URL.",
    triggers: "prepare this application https://…; fill out this job application <link>; help me apply to this grant <link>; start an application for <link>.",
    status: "live",
  },
  email: {
    kind: "email",
    label: "Email agent",
    tab: "Email",
    blurb: "Mines your already-synced Gmail into sourced tasks, events, and follow-ups — each linked to the exact message — and drops them in the Review queue to approve. (To just ASK about your inbox, the Jarvis assistant answers from your synced mail.)",
    triggers: "turn my inbox into tasks; triage my synced mail into to-dos; pull action items out of my email.",
    status: "live",
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
    blurb: "Answers QUESTIONS about your own connected data — your Gmail, calendar, meetings, tasks, contacts and opportunities — and also searches the web for current facts and reads your local files. The catch-all when no specialized agent fits.",
    triggers: "what's on my plate today?; what's on my calendar tomorrow?; did anyone email me about the internship?; what do I owe a reply to?; who am I tracking at OpenAI?; search up the latest on X; read my fineprint folder.",
    status: "live",
  },
};

export const AGENT_KINDS = Object.keys(AGENTS) as AgentKind[];

export function agentMeta(kind: AgentKind): AgentMeta {
  return AGENTS[kind];
}
