import type { CardSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SourceChip } from "@/components/SourceChip";

export type CardProps = {
  title: string;
  /**
   * REQUIRED. Every card must prove where it came from.
   * A card with no source (or no source quote) throws in development and renders nothing in
   * production, enforcing the hard rule: "no UI card renders without a working source chip."
   */
  source: CardSource;
  /** Optional body content under the title (goal chips, a quote, sub-items). */
  children?: React.ReactNode;
  /** Optional one-line "why Otto created this". */
  reasoning?: string;
  /** The type/status column (e.g. a TASK / EVENT / NEEDS REPLY pill). */
  kind?: React.ReactNode;
  /** The right-hand due/status column (e.g. a due date, "Waiting on you"). */
  meta?: React.ReactNode;
  /** Right-column actions under the due (Reply in Gmail, Accept/Dismiss). */
  actions?: React.ReactNode;
  /**
   * "card" = bordered, self-contained tile. "row" (default) = a borderless four-column grid
   * (info | type | source | due) meant to sit inside a divided sheet-list (Today / Suggested).
   * The four columns align down the list so the eye reads: what it is, its type, its source, when due.
   */
  variant?: "card" | "row";
};

/**
 * The provenance-enforcing item primitive. Reused wherever a derived item is shown.
 * Invariant: it cannot render without a working source chip. Dense (Notion/Sheets rhythm).
 */
export function Card({ title, source, children, reasoning, kind, meta, actions, variant = "row" }: CardProps) {
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

  const info = (
    <div className="min-w-0">
      <h3 className="text-sm font-medium leading-snug text-foreground">{title}</h3>
      {reasoning && (
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          <span className="text-muted-strong">Why </span>
          {reasoning}
        </p>
      )}
      {children && <div className="mt-1 min-w-0 break-words text-sm leading-snug text-muted-strong">{children}</div>}
    </div>
  );

  if (variant === "card") {
    return (
      <article className="min-w-0 rounded-md border bg-card p-3">
        <div className="flex items-start justify-between gap-3">
          {info}
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {kind}
              {meta}
            </span>
            <SourceChip source={source} />
            {actions && <div className="flex items-center gap-1.5">{actions}</div>}
          </div>
        </div>
      </article>
    );
  }

  // Row: four aligned columns. Stacks on mobile; spreads across the width on md+.
  return (
    <article className="grid min-w-0 grid-cols-1 items-start gap-x-4 gap-y-1.5 md:grid-cols-[minmax(0,1fr)_5rem_13.5rem_12.5rem] md:gap-y-0">
      {info}
      <div className="min-w-0 md:pt-0.5">{kind}</div>
      <div className="min-w-0 md:pt-0.5">
        <SourceChip source={source} />
      </div>
      <div className="flex flex-col items-start gap-1 text-xs md:items-end md:pt-0.5 md:text-right">
        {meta}
        {actions && <div className="flex flex-wrap items-center gap-1.5 md:justify-end">{actions}</div>}
      </div>
    </article>
  );
}
