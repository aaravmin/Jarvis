import type { CardSource } from "@/lib/types";
import { SourceChip } from "@/components/SourceChip";

export type CardProps = {
  title: string;
  /**
   * REQUIRED. Every card must prove where it came from.
   * A card with no source (or no source quote) throws in development and renders nothing in
   * production — enforcing the hard rule: "no UI card renders without a working source chip."
   */
  source: CardSource;
  /** Optional body content (description, sub-items, etc.). */
  children?: React.ReactNode;
  /** Optional one-line "why Jarvis created this". */
  reasoning?: string;
  /** Optional right-aligned slot in the header (e.g. a due date or status badge). */
  meta?: React.ReactNode;
  /** Optional footer-right actions (e.g. Accept/Dismiss in the Review queue). */
  actions?: React.ReactNode;
};

/**
 * The provenance-enforcing card primitive. Reused everywhere a derived item is shown.
 * Invariant: it cannot render without a working source chip.
 */
export function Card({ title, source, children, reasoning, meta, actions }: CardProps) {
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
    <article className="rounded-xl border border-border bg-surface-2 p-4 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-foreground">{title}</h3>
        {meta && <div className="shrink-0 text-xs text-muted">{meta}</div>}
      </div>

      {children && <div className="mt-2 text-sm leading-relaxed text-muted-strong">{children}</div>}

      {reasoning && (
        <p className="mt-2 text-xs italic text-muted">
          <span className="not-italic text-muted-strong">Why: </span>
          {reasoning}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <SourceChip source={source} />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </article>
  );
}
