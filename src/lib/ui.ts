/**
 * Shared UI tokens. One source of truth so every surface (Today, Suggested, Tasks, Email, Calendar,
 * Meetings, Goals) reads as the same calm, contained Notion-style product.
 */

/**
 * The contained content column. A centered, comfortable width applied on EVERY surface (the (app)
 * layout's <main> and the Topbar) so the whole app is one column, not full-bleed and not a skinny
 * sidebar list. Grouping properties near their title only reads well inside a contained column.
 */
export const CONTENT_COL = "mx-auto w-full max-w-4xl";

/**
 * The one standardized property pill. Type, goal, and source chips all share this quiet, softly
 * filled look (Notion's calm select-property style). Color is reserved for meaning - overdue red,
 * done green - and is layered on by the caller, never baked into the base pill.
 */
export const PILL =
  "inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground";
