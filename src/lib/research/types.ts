import type { ResearchTarget } from "@/lib/types";

/** Lifecycle of a research run, mirrors research_runs.status. */
export type ResearchRunStatus = "running" | "done" | "error";

/** Provenance for a single auto-filled field (validated against real web_search citations). */
export type FieldSource = { url?: string; quote?: string; confidence?: number };

/** A contact method discovered for a person, with whether its source survived validation. */
export type DiscoveredChannel = {
  kind: string; // 'email' | 'linkedin' | 'phone' | 'x' | 'website' | 'other'
  value: string;
  confidence?: number;
  sourceUrl?: string;
  verified: boolean;
};

/** A proposed link from a discovered person to one of the user's existing goals. */
export type DiscoveredGoalLink = {
  goalId: string;
  rationale?: string;
  confidence?: number;
};

/**
 * A discovered person as returned to the UI — AFTER server-side validation. Every value here that
 * carries a source has been checked against the run's real web_search citations; unbacked claims
 * are dropped or marked unverified in `notes`. `sourceQuote` is guaranteed non-empty (unprovenanced
 * candidates are dropped server-side), so a <Card> built from this never trips its guardrail.
 */
export type DiscoveredPerson = {
  id: string; // contacts.id
  fullName: string;
  company?: string;
  roleTitle?: string;
  background?: string;
  relevance?: string;
  theAsk?: string;
  notes?: string;
  sourceQuote: string; // verbatim cohort-match snippet
  sourceUrl?: string; // primary backing citation
  confidence?: number; // 0..1 match confidence
  reviewStatus: "review" | "accepted" | "dismissed";
  channels: DiscoveredChannel[];
  goalLinks: DiscoveredGoalLink[];
  fieldSources: Record<string, FieldSource>;
};

/** A full run as the Review/People UI consumes it. */
export type ResearchRunView = {
  id: string;
  query: string;
  targetKind: ResearchTarget;
  status: ResearchRunStatus;
  resultCount: number;
  error?: string;
  createdAt: string;
  people: DiscoveredPerson[];
};
