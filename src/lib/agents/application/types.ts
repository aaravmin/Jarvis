/**
 * Types for the Application agent. It reads a form (the "eyes"), grounds each field in the user's
 * materials with Grok (the "brain"), and produces a reviewable field_plan. It NEVER submits — the user
 * reviews and submits (hard rule #5, submit-only-on-click).
 *
 * Dates follow hard rule #2: the model never computes them. A field that needs a date is only filled
 * when the date appears verbatim in the user's materials; otherwise it's left for the user.
 */

/** Application kind — mirrors application_runs.kind. */
export type ApplicationKind = "job" | "grant" | "other";

/** Lifecycle of an application run — mirrors application_runs.status. */
export type ApplicationRunStatus = "running" | "needs_review" | "submitted" | "error";

/** The control type of a scraped form field (drives how the value would be entered). */
export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "other";

/** One field read off the application form, before any value is resolved. */
export type FormField = {
  /** The form control's name/id (used to key the field; may be synthetic if the form omits one). */
  name: string;
  /** The human label the applicant sees (from <label>, aria-label, placeholder, or the name). */
  label: string;
  type: FormFieldType;
  required: boolean;
  /** Choices for select/radio/checkbox fields, verbatim from the form. */
  options?: string[];
};

/**
 * Where a filled value came from. Mirrors the documented field_plan shape in migration 0016:
 *   resume | profile | document | opportunity | inferred | user
 * "inferred" = the model proposed it but we could NOT ground it in a quote (low trust, never auto-used
 * for anything irreversible). "user" = a required field only the user can answer (left blank on purpose).
 */
export type FieldValueSource = "resume" | "profile" | "document" | "opportunity" | "inferred" | "user";

/**
 * One resolved field, with provenance (hard rule #3). Stored verbatim as a jsonb element in
 * application_runs.field_plan — keys are snake_case to match the documented DB contract.
 */
export type FieldPlanItem = {
  label: string;
  /** The value to enter. Empty string when the agent couldn't ground it (filled=false). */
  value: string;
  source: FieldValueSource;
  /** Verbatim snippet from the materials that backs `value`. Required whenever filled=true. */
  source_quote: string;
  confidence: number; // 0..1
  required: boolean;
  filled: boolean;
};

/** A full application run as the run screen consumes it. */
export type ApplicationRunView = {
  id: string;
  targetUrl: string;
  kind: ApplicationKind;
  title?: string;
  organization?: string;
  resumeId?: string;
  status: ApplicationRunStatus;
  fieldPlan: FieldPlanItem[];
  unfilledCount: number;
  summary?: string;
  error?: string;
  createdAt: string;
};

/** A run result returned by the orchestrator (mirrors OpportunityRunResult's shape). */
export type ApplicationRunResult =
  | { status: "reused"; runId: string }
  | { status: "done"; view: ApplicationRunView }
  | { status: "error"; runId: string; error: string };

/** Count of required fields the agent could not ground — these need the user before submitting. */
export function countUnfilled(plan: FieldPlanItem[]): number {
  return plan.filter((f) => f.required && !f.filled).length;
}
