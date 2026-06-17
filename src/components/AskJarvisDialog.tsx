"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { useResearchRun } from "@/lib/research/useResearchRun";
import { RESEARCH_TARGETS } from "@/lib/research/targets";

/**
 * The "Ask Jarvis to find…" command surface. Today its one capability is target='people' cohort
 * research. onSubmit takes a plain string so Phase 8 voice can feed a transcript to the same path.
 */
export function AskJarvisDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const config = RESEARCH_TARGETS.people;

  const { phase, error, elapsed, submit, cancel } = useResearchRun(() => {
    onClose();
    setQuery("");
    router.push("/review");
    router.refresh();
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (phase === "running") cancel();
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, phase, cancel, onClose]);

  if (!open) return null;

  const running = phase === "running";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Ask Jarvis">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => (running ? undefined : onClose())} />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!running && query.trim().length >= 4) submit(query.trim());
          }}
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-accent" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={running}
              placeholder={config.placeholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
            <button type="button" onClick={() => (running ? cancel() : onClose())} aria-label="Close" className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 py-3">
            {running ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Searching the web and verifying every match… {elapsed}s
                <span className="ml-2 text-xs">(Esc to cancel)</span>
              </div>
            ) : (
              <>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                  Try
                </p>
                <div className="flex flex-wrap gap-2">
                  {config.exampleQueries.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setQuery(ex)}
                      className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                {error && <p className="mt-3 text-xs text-danger">{error}</p>}
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-[11px] text-muted">
              Results land in <span className="text-muted-strong">Review</span> — nothing is added until
              you approve it.
            </p>
            <button
              type="submit"
              disabled={running || query.trim().length < 4}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {running ? "Researching…" : config.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
