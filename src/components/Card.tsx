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
  /** Optional body content (description, sub-items, etc.). */
  children?: React.ReactNode;
  /** Optional one-line "why GOTT created this". */
  reasoning?: string;
  /** Optional right-aligned slot in the header (e.g. a due date or status badge). */
  meta?: React.ReactNode;
  /** Optional footer-right actions (e.g. Accept/Dismiss in the Review queue). */
  actions?: React.ReactNode;
  /**
   * "card" (default) = bordered, self-contained tile. "row" = borderless dense content meant to sit
   * inside a divided sheet-list container (Today / Review), where the list owns the hairlines.
   */
  variant?: "card" | "row";
};

/**
 * The provenance-enforcing item primitive. Reused everywhere a derived item is shown.
 * Invariant: it cannot render without a working source chip. Dense by default (Notion/Sheets rhythm).
 */
export function Card({ title, source, children, reasoning, meta, actions, variant = "card" }: CardProps) {
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

  return (
    <article
      className={cn(
        "min-w-0",
        variant === "card" && "rounded-md border bg-card p-3 transition-colors hover:border-border-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium leading-snug text-foreground">{title}</h3>
        {meta && <div className="shrink-0 text-xs text-muted-foreground">{meta}</div>}
      </div>

      {children && <div className="mt-1 min-w-0 break-words text-sm leading-snug text-muted-strong">{children}</div>}

      {reasoning && (
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          <span className="text-muted-strong">Why </span>
          {reasoning}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <SourceChip source={source} />
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
    </article>
  );
}
