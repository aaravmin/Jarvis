"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  Mic,
  CalendarDays,
  PenLine,
  ExternalLink,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CardSource, SourceType } from "@/lib/types";
import { formatWhen, sourceLabel } from "@/lib/format";

const SOURCE_ICONS: Record<SourceType, LucideIcon> = {
  email: Mail,
  meeting: Mic,
  calendar: CalendarDays,
  manual: PenLine,
};

function confidenceTone(c: number): string {
  if (c >= 0.85) return "text-success";
  if (c >= 0.6) return "text-warning";
  return "text-danger";
}

/**
 * The provenance chip + modal. Clicking the chip opens the exact source quote and a link to the
 * original. This is rendered by <Card> for EVERY card — it is the "tells me exactly where it got
 * that" feature.
 */
export function SourceChip({ source }: { source: CardSource }) {
  const [open, setOpen] = useState(false);
  const Icon = SOURCE_ICONS[source.type] ?? PenLine;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
        title="See where this came from"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
        <span className="truncate">
          {sourceLabel(source.type)}
          {source.title ? ` · ${source.title}` : ""}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Source"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
                  <Icon className="h-4 w-4 text-accent" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {sourceLabel(source.type)}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {source.title ?? "Source"}
                    {source.occurredAt ? ` · ${formatWhen(source.occurredAt)}` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                  Exact quote
                </p>
                <blockquote className="rounded-lg border-l-2 border-accent bg-accent-soft/60 px-3 py-2 text-sm italic text-foreground">
                  “{source.quote}”
                </blockquote>
              </div>

              {source.rawText && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                    In context
                  </p>
                  <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted-strong">
                    {highlightQuote(source.rawText, source.quote)}
                  </p>
                </div>
              )}

              {typeof source.confidence === "number" && (
                <p className="text-xs text-muted">
                  Extractor confidence:{" "}
                  <span className={`font-semibold ${confidenceTone(source.confidence)}`}>
                    {Math.round(source.confidence * 100)}%
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              {source.permalink ? (
                <a
                  href={source.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-[#04181f] transition-colors hover:bg-accent-strong"
                >
                  <ExternalLink className="h-4 w-4" />
                  View original
                </a>
              ) : (
                <span className="text-xs text-muted">No external link — shown in context above.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Render rawText with the matched quote emphasized, if present. */
function highlightQuote(rawText: string, quote: string) {
  const idx = rawText.toLowerCase().indexOf(quote.toLowerCase());
  if (idx === -1) return rawText;
  const before = rawText.slice(0, idx);
  const match = rawText.slice(idx, idx + quote.length);
  const after = rawText.slice(idx + quote.length);
  return (
    <>
      {before}
      <mark className="rounded bg-accent/30 px-0.5 text-foreground">{match}</mark>
      {after}
    </>
  );
}
