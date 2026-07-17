import type { CardSource } from "@/lib/types";
import { SourceChip } from "@/components/SourceChip";

export type CardProps = {
  title: string;
  /**
   * REQUIRED. Every card must prove where it came from.
   * A card with no source (or no source quote) throws in development and renders nothing in
   * production, enforcing the hard rule: "no UI card renders without a working source chip."
   */
  source: CardSource;
  /** Optional richer body under the title/pills (a quoted line, related meetings). */
  children?: React.ReactNode;
  /** Optional one-line "why Otto created this", shown as a quiet secondary line. */
  reasoning?: string;
  /** The type pill (Task / Event / Needs reply). Rendered in the property cluster next to the title. */
  kind?: React.ReactNode;
  /** Extra property pills (goal chips) clustered with the title, between the type pill and the source. */
  tags?: React.ReactNode;
  /** The right-hand due/status column (a due date, "Waiting on you"). */
  meta?: React.ReactNode;
  /** Right-column actions under the due (Reply in Gmail, Accept/Dismiss). */
  actions?: React.ReactNode;
  /**
   * "row" (default) = a grouped Notion-style row: the title and its property pills cluster together,
   * with due/actions pinned right. Meant to sit inside a divided sheet-list (Today / Suggested).
   * "card" = the same grouped layout inside a self-contained bordered tile.
   */
  variant?: "card" | "row";
};

/**
 * The provenance-enforcing item primitive. Reused wherever a derived item is shown.
 * Invariant: it cannot render without a working source chip. Grouped, contained, Notion-calm: the
 * eye reads title -> its property pills (type, goal, source) -> due, without hunting across a wide gap.
 */
export function Card({ title, source, children, reasoning, kind, tags, meta, actions, variant = "row" }: CardProps) {
  // Enforce the invariant. Loud in development, silent-but-logged in production.
  if (!source || typeof source.quote !== "string" || source.quote.trim() === "") {
    const message =
      `<Card title="${title}"> was rendered without a valid source. ` +
      `Every card must include a \`source\` with a non-empty \`quote\` ` +
      `(see /CLAUDE.md: "no UI card renders without a working source chip").`;
    if (process.env.NODE_ENV !== "production") {
      throw new Error(message);
    }
    if (typeof console !== "undefined") console.error(message);
    return null;
  }

  const body = (
    <div className="min-w-0 flex-1">
      {/* Title + its property pills, grouped so they read as one unit. Wraps together on narrow rows. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-sm font-medium leading-snug text-foreground">{title}</h3>
        <span className="flex flex-wrap items-center gap-1">
          {kind}
          {tags}
          <SourceChip source={source} />
        </span>
      </div>
      {reasoning && (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          <span className="text-muted-strong">Why </span>
          {reasoning}
        </p>
      )}
      {children && <div className="mt-1 min-w-0 break-words text-sm leading-snug text-muted-strong">{children}</div>}
    </div>
  );

  const rightRail = (meta || actions) && (
    <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-right text-xs">
      {meta}
      {actions && <div className="flex flex-wrap items-center justify-end gap-1.5">{actions}</div>}
    </div>
  );

  if (variant === "card") {
    return (
      <article className="flex min-w-0 items-start justify-between gap-3 rounded-md border bg-card p-3">
        {body}
        {rightRail}
      </article>
    );
  }

  return (
    <article className="flex min-w-0 items-start justify-between gap-3">
      {body}
      {rightRail}
    </article>
  );
}
