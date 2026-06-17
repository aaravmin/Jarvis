/**
 * Shared domain types. These mirror the data model in /docs/DATA_MODEL.md.
 * The DB is the system of record; these are the in-app shapes used by the UI.
 */

export type SourceType = "email" | "meeting" | "calendar" | "manual" | "research";

/**
 * Everything the provenance "source chip" needs to prove where an item came from.
 * In the database this is a join of `items` (source_quote, confidence, source_id) and
 * `sources` (source_type, title, permalink, occurred_at, raw_text).
 *
 * `quote` is REQUIRED: no derived item exists without the exact line that justified it.
 */
export type CardSource = {
  type: SourceType;
  /** The EXACT extracted line that justified the item. Required — this is the whole point. */
  quote: string;
  /** e.g. email subject / meeting name. */
  title?: string;
  /** Deep link back to the original (Gmail/Calendar/transcript). */
  permalink?: string;
  /** ISO timestamp of when the email/meeting/event occurred. */
  occurredAt?: string;
  /** Fallback context shown when there is no permalink (e.g. a pasted transcript). */
  rawText?: string;
  /** 0..1 extractor confidence. */
  confidence?: number;
  /**
   * Optional per-field provenance. When a single card asserts several facts that each came from a
   * different place (e.g. a discovered person's email vs. role vs. company), every fact carries its
   * own source. Additive: existing single-source call sites omit this and are unaffected.
   */
  fields?: CardFieldSource[];
};

/** One claim on a card and the source that backs it. The inner `source` is a full CardSource. */
export type CardFieldSource = {
  /** Human label for the claim, e.g. "Email", "Role", "Company". */
  label: string;
  /** The asserted value, e.g. "jane@acme.com". */
  value: string;
  /** Where that specific value came from (its own quote / link / confidence). */
  source: CardSource;
};

export type ItemType = "task" | "event" | "follow_up" | "app_status" | "outreach";
export type ItemStatus = "review" | "accepted" | "done" | "dismissed";

/** The kind of thing an auto-populate research run discovers. People first; the only seam for later. */
export type ResearchTarget = "people";
