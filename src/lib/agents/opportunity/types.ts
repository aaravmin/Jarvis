/**
 * Types for the Opportunity agent. Mirrors src/lib/research/types.ts (the people agent) so the
 * Review queue, provenance <Card>, and load/map helpers all follow one shape.
 *
 * Dates here come in pairs: a `raw*` string (verbatim from the source, what the model returned) and
 * a resolved timestamp (`deadlineAt` / `startsAt` / `endsAt`) that OUR code computed with chrono-node.
 * The raw string is the source of truth shown to the user; the resolved value is for sorting/reminders.
 */

/** DB category enum (opportunities.category). */
export type OpportunityCategory =
  | "program"
  | "job"
  | "internship"
  | "hackathon"
  | "fellowship"
  | "grant"
  | "scholarship"
  | "competition"
  | "accelerator"
  | "other";

/** The buckets the user can ask for. 'all' = no filter. Mirrors opportunity_runs.kind_filter. */
export type OpportunityKindFilter = "all" | "programs" | "jobs" | "hackathons";

/** Lifecycle of an opportunity search, mirrors opportunity_runs.status. */
export type OpportunityRunStatus = "running" | "done" | "error";

/**
 * Where the user is in actually pursuing an opportunity (opportunities.application_status).
 * Distinct from reviewStatus (which only gates the Review queue). User-driven, never set by the LLM.
 */
export type ApplicationStatus =
  | "not_applied"
  | "waiting_to_open"
  | "applied"
  | "interviewing"
  | "accepted"
  | "rejected";

/** Ordered list + labels for the application-status control (single source of truth for the UI). */
export const APPLICATION_STATUSES: { value: ApplicationStatus; label: string }[] = [
  { value: "not_applied", label: "Not applied" },
  { value: "waiting_to_open", label: "Waiting to open" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

/** Provenance for a single auto-filled field (validated against real web_search citations). */
export type FieldSource = { url?: string; quote?: string; confidence?: number };

/**
 * A discovered opportunity as returned to the UI — AFTER server-side validation and date resolution.
 * `sourceQuote` is guaranteed non-empty (unprovenanced rows are dropped server-side), so a <Card>
 * built from this never trips its guardrail.
 */
export type DiscoveredOpportunity = {
  id: string; // opportunities.id
  title: string;
  organization?: string;
  category: OpportunityCategory;
  description?: string;
  location?: string;
  isRemote?: boolean;
  howToApplyUrl?: string;
  requirements?: string;
  requiredSkills: string[];
  compOrPrize?: string;

  // Dates — raw (verbatim, from the model) + resolved (chrono, by our code).
  rawDeadline?: string;
  deadlineAt?: string; // ISO; undefined when unparseable (e.g. "rolling")
  rawEventDates?: string;
  startsAt?: string; // ISO
  endsAt?: string; // ISO

  notes?: string;
  sourceQuote: string; // verbatim match snippet
  sourceUrl?: string; // primary backing citation
  confidence?: number; // 0..1 match confidence
  reviewStatus: "review" | "accepted" | "dismissed";
  applicationStatus: ApplicationStatus; // pipeline state; defaults to "not_applied"
  fieldSources: Record<string, FieldSource>;
};

/** A full opportunity run as the Review / Opportunities UI consumes it. */
export type OpportunityRunView = {
  id: string;
  query: string;
  kindFilter: OpportunityKindFilter;
  status: OpportunityRunStatus;
  resultCount: number;
  error?: string;
  createdAt: string;
  opportunities: DiscoveredOpportunity[];
};
