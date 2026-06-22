"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { useResearchRun } from "@/lib/research/useResearchRun";
import { RESEARCH_TARGETS } from "@/lib/research/targets";

/**
 * Inline cohort-research bar for the People page. Same submit path as AskJarvisDialog (and Phase 8
 * voice), on completion it routes to Review where the discovered people await approval.
 */
export function FindPeopleBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const config = RESEARCH_TARGETS.people;

  const { phase, error, elapsed, submit, cancel } = useResearchRun(() => {
    setQuery("");
    router.push("/review");
    router.refresh();
  });

  const running = phase === "running";

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!running && query.trim().length >= 4) submit(query.trim());
        }}
        className="flex items-center gap-2"
      >
        <Search className="h-4 w-4 shrink-0 text-accent" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={running}
          placeholder={config.placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        {running ? (
          <button
            type="button"
            onClick={cancel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            {elapsed}s · cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={query.trim().length < 4}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {config.label}
          </button>
        )}
      </form>
      {error && <p className="mt-2 px-6 text-xs text-danger">{error}</p>}
      {running && (
        <p className="mt-2 px-6 text-xs text-muted">
          Searching the web and verifying every match against real citations, this can take up to a
          minute. Results appear in Review.
        </p>
      )}
    </div>
  );
}
