import type { ContactOutreachStatus, DiscoveredPerson } from "@/lib/research/types";
import type { ValidatedCandidate } from "@/lib/research/extract";

/** Loose shapes for the Supabase rows we read back (only the columns we use). */
export type ContactRow = {
  id: string;
  full_name: string;
  company: string | null;
  role_title: string | null;
  background: string | null;
  relevance: string | null;
  the_ask: string | null;
  notes: string | null;
  source_quote: string | null;
  confidence: number | null;
  review_status: "review" | "accepted" | "dismissed";
  outreach_status: ContactOutreachStatus | null;
  field_sources: Record<string, { url?: string; quote?: string; confidence?: number; status?: string }> | null;
};
export type ChannelRow = {
  contact_id: string;
  kind: string;
  value: string;
  is_primary: boolean | null;
};
export type GoalLinkRow = {
  contact_id: string;
  goal_id: string;
  rationale: string | null;
  confidence: number | null;
};

/** Build the UI shape straight from an in-memory validated candidate + its new contact id. */
export function candidateToPerson(id: string, c: ValidatedCandidate): DiscoveredPerson {
  return {
    id,
    fullName: c.fullName,
    company: c.company,
    roleTitle: c.roleTitle,
    background: c.background,
    relevance: c.relevance,
    theAsk: c.theAsk,
    notes: c.notes,
    sourceQuote: c.sourceQuote,
    sourceUrl: c.sourceUrl,
    confidence: c.confidence,
    reviewStatus: "review",
    outreachStatus: "not_emailed",
    channels: c.channels,
    goalLinks: c.goalLinks,
    fieldSources: c.fieldSources,
  };
}

/** Build the UI shape from persisted rows (used by GET on reload). */
export function rowsToPerson(
  contact: ContactRow,
  channels: ChannelRow[],
  goalLinks: GoalLinkRow[],
): DiscoveredPerson {
  const fs = contact.field_sources ?? {};
  // Derive a primary backing URL from field_sources if present (display convenience).
  const primaryUrl = Object.values(fs).find((v) => v?.url)?.url;
  return {
    id: contact.id,
    fullName: contact.full_name,
    company: contact.company ?? undefined,
    roleTitle: contact.role_title ?? undefined,
    background: contact.background ?? undefined,
    relevance: contact.relevance ?? undefined,
    theAsk: contact.the_ask ?? undefined,
    notes: contact.notes ?? undefined,
    sourceQuote: contact.source_quote ?? "",
    sourceUrl: primaryUrl,
    confidence: contact.confidence ?? undefined,
    reviewStatus: contact.review_status,
    outreachStatus: contact.outreach_status ?? "not_emailed",
    channels: channels
      .filter((ch) => ch.contact_id === contact.id)
      .map((ch) => ({ kind: ch.kind, value: ch.value, verified: true })),
    goalLinks: goalLinks
      .filter((g) => g.contact_id === contact.id)
      .map((g) => ({
        goalId: g.goal_id,
        rationale: g.rationale ?? undefined,
        confidence: g.confidence ?? undefined,
      })),
    fieldSources: fs,
  };
}
