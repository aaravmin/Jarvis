"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Compass } from "lucide-react";
import { useOpportunityRun } from "@/lib/agents/opportunity/useOpportunityRun";
import type { OpportunityKindFilter } from "@/lib/agents/opportunity/types";

const FILTERS: { key: OpportunityKindFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "programs", label: "Programs" },
  { key: "jobs", label: "Jobs" },
  { key: "hackathons", label: "Hackathons" },
];

const PLACEHOLDER: Record<OpportunityKindFilter, string> = {
  all: "Describe what to find, e.g. biotech hackathons with upcoming deadlines",
  programs: "e.g. summer research fellowships for CS sophomores",
  jobs: "e.g. new-grad software engineer roles at climate-tech startups",
  hackathons: "e.g. AI hackathons with cash prizes in the next 2 months",
};

/**
 * Inline opportunity-search bar for the Opportunities page. Same submit path as the multi-agent
 * router (and Phase 8 voice). On completion it routes to Review, where discovered opportunities await
 * approval before they land on the Opportunities tab (L0 suggest-only).
 */
export function FindOpportunitiesBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<OpportunityKindFilter>("all");

  const { phase, error, elapsed, submit, cancel } = useOpportunityRun(() => {
    setQuery("");
    router.push("/review");
    router.refresh();
  });

  const running = phase === "running";

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKindFilter(f.key)}
            disabled={running}
            aria-pressed={kindFilter === f.key}
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              kindFilter === f.key
                ? "bg-accent text-white"
                : "border border-border text-muted hover:text-foreground",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!running && query.trim().length >= 4) submit(query.trim(), kindFilter);
        }}
        className="flex items-center gap-2"
      >
        <Compass className="h-4 w-4 shrink-0 text-accent" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={running}
          placeholder={PLACEHOLDER[kindFilter]}
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
            Find
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
