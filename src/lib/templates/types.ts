/**
 * Types for the connection-aware email template system.
 *
 * The privacy contract (the user's explicit instruction): the CONCRETE draft may contain the personal
 * connection detail ("my dad worked with you at Acme") because it's the actual email they'll send. But
 * the GENERALIZED template and the ConnectionType that get persisted must only ever describe the *kind*
 * of relationship, never the specifics. The detail is used in-memory to write one email and discarded.
 */

export type TemplateSource = "user" | "jarvis" | "drive";

/** A generalized, reusable kind of relationship (e.g. "Parent's professional contact"). */
export type ConnectionType = {
  id: string;
  label: string;
  description?: string;
  guidance?: string;
  timesUsed: number;
};

export type EmailTemplate = {
  id: string;
  name: string;
  subject?: string;
  body: string;
  placeholders: string[];
  source: TemplateSource;
  connectionTypeId?: string;
  connectionTypeLabel?: string;
  driveFileId?: string;
  timesUsed: number;
  /** Freeform user instructions on how to use this template (e.g. how to fill bracketed slots). */
  instructions?: string;
};

/** The concrete email written for one specific contact (may include personal specifics). */
export type ComposedDraft = { subject: string; body: string };

/** The generalized, reusable template saved after approval, NO personal specifics. */
export type GeneralizedTemplate = {
  name: string;
  subject: string;
  body: string; // placeholders (e.g. {{connection}}) where the personal detail was
  placeholders: string[];
};

/** The generalized connection type proposed alongside the draft, NO personal specifics. */
export type ProposedConnectionType = {
  label: string;
  description: string;
  guidance: string;
};

export type ComposeResult = {
  draft: ComposedDraft;
  generalized: GeneralizedTemplate;
  connectionType: ProposedConnectionType;
  baseTemplateName?: string;
  /** False if our server-side scrubber had to strip a personal detail that leaked into the template. */
  privacyOk: boolean;
  privacyNote?: string;
};
