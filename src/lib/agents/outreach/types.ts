/**
 * Types for the Outreach agent — drafts a tailored email to a contact. The audience BRANCH shapes the
 * tone: an investor cold email reads nothing like a note to a peer. Output is always a Gmail DRAFT for
 * the user to review and send (hard rule #5, never auto-sends).
 */

/** Outreach audience — mirrors outreach_runs.audience. The branch that sets tone + the kind of ask. */
export type Audience = "investor" | "recruiter" | "professor" | "peer" | "founder" | "other";

/** Lifecycle of an outreach draft — mirrors outreach_runs.status. */
export type OutreachRunStatus = "running" | "drafted" | "saved" | "error";

/** Per-audience tone + ask guidance the composer branches on. Single source of truth for the UI + model. */
export const AUDIENCES: { value: Audience; label: string; guidance: string }[] = [
  {
    value: "investor",
    label: "Investor",
    guidance:
      "Concise and credible. Lead with the single most compelling fact (traction, insight, or team). No hype or filler. Make a clear, low-friction ask (a short call or a warm intro). Respect their time — short.",
  },
  {
    value: "recruiter",
    label: "Recruiter",
    guidance:
      "Professional and role-focused. Surface the most relevant experience for the role, signal genuine interest and availability, and ask for the next concrete step (a call or to be considered).",
  },
  {
    value: "professor",
    label: "Professor",
    guidance:
      "Respectful and specific. Reference their actual work/research precisely, state a concrete shared interest, and make a humble, narrow ask (office hours, a question, or research involvement). No flattery.",
  },
  {
    value: "peer",
    label: "Peer",
    guidance:
      "Warm, genuine, and casual. Note a real shared interest or context. Keep it low-pressure and human; the ask is light (grab time, compare notes).",
  },
  {
    value: "founder",
    label: "Founder",
    guidance:
      "Builder-to-builder and energetic but grounded. Be specific about what they're building, why it resonates, and propose a concrete way to connect or collaborate.",
  },
  {
    value: "other",
    label: "Other",
    guidance: "Professional, warm, and concise. Make the relevance clear and the ask specific.",
  },
];

export function audienceGuidance(a: Audience): string {
  return (AUDIENCES.find((x) => x.value === a) ?? AUDIENCES[AUDIENCES.length - 1]).guidance;
}

/** A full outreach run as the drafting UI consumes it. */
export type OutreachRunView = {
  id: string;
  contactId?: string;
  contactName?: string;
  contactEmail?: string;
  audience: Audience;
  goal?: string;
  templateId?: string;
  draftSubject?: string;
  draftBody?: string;
  gmailDraftId?: string;
  status: OutreachRunStatus;
  error?: string;
  createdAt: string;
};

export type OutreachRunResult =
  | { status: "done"; view: OutreachRunView }
  | { status: "error"; runId: string; error: string };
