import type { ApplicationStatus, DiscoveredOpportunity, OpportunityCategory } from "@/lib/agents/opportunity/types";
import type { ValidatedOpportunity } from "@/lib/agents/opportunity/extract";

/** The opportunities columns we read back (only what the UI uses). */
export type OpportunityRow = {
  id: string;
  title: string;
  organization: string | null;
  category: OpportunityCategory;
  description: string | null;
  location: string | null;
  is_remote: boolean | null;
  how_to_apply_url: string | null;
  requirements: string | null;
  required_skills: string[] | null;
  comp_or_prize: string | null;
  notes: string | null;
  raw_deadline: string | null;
  deadline_at: string | null;
  raw_event_dates: string | null;
  starts_at: string | null;
  ends_at: string | null;
  source_quote: string | null;
  confidence: number | null;
  review_status: "review" | "accepted" | "dismissed";
  application_status: ApplicationStatus;
  field_sources: Record<string, { url?: string; quote?: string; confidence?: number }> | null;
};

/** The columns string for SELECTs (kept in one place so reads stay consistent). */
export const OPPORTUNITY_COLS =
  "id, title, organization, category, description, location, is_remote, how_to_apply_url, requirements, required_skills, comp_or_prize, notes, raw_deadline, deadline_at, raw_event_dates, starts_at, ends_at, source_quote, confidence, review_status, application_status, field_sources";

/** Build the UI shape from an in-memory validated opportunity + the dates our code resolved. */
export function validatedToOpportunity(
  id: string,
  v: ValidatedOpportunity,
  resolved: { deadlineAt?: string; startsAt?: string; endsAt?: string },
): DiscoveredOpportunity {
  return {
    id,
    title: v.title,
    organization: v.organization,
    category: v.category,
    description: v.description,
    location: v.location,
    isRemote: v.isRemote,
    howToApplyUrl: v.howToApplyUrl,
    requirements: v.requirements,
    requiredSkills: v.requiredSkills,
    compOrPrize: v.compOrPrize,
    rawDeadline: v.rawDeadline,
    deadlineAt: resolved.deadlineAt,
    rawEventDates: v.rawEventDates,
    startsAt: resolved.startsAt,
    endsAt: resolved.endsAt,
    notes: v.notes,
    sourceQuote: v.sourceQuote,
    sourceUrl: v.sourceUrl,
    confidence: v.confidence,
    reviewStatus: "review",
    applicationStatus: "not_applied",
    fieldSources: v.fieldSources,
  };
}

/** Build the UI shape from a persisted row (used on reload). */
export function rowToOpportunity(row: OpportunityRow): DiscoveredOpportunity {
  const fs = row.field_sources ?? {};
  const primaryUrl = Object.values(fs).find((v) => v?.url)?.url;
  return {
    id: row.id,
    title: row.title,
    organization: row.organization ?? undefined,
    category: row.category,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    isRemote: row.is_remote ?? undefined,
    howToApplyUrl: row.how_to_apply_url ?? undefined,
    requirements: row.requirements ?? undefined,
    requiredSkills: row.required_skills ?? [],
    compOrPrize: row.comp_or_prize ?? undefined,
    rawDeadline: row.raw_deadline ?? undefined,
    deadlineAt: row.deadline_at ?? undefined,
    rawEventDates: row.raw_event_dates ?? undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    notes: row.notes ?? undefined,
    sourceQuote: row.source_quote ?? "",
    sourceUrl: primaryUrl,
    confidence: row.confidence ?? undefined,
    reviewStatus: row.review_status,
    applicationStatus: row.application_status ?? "not_applied",
    fieldSources: fs,
  };
}
