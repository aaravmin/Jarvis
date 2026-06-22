"use client";

import { useState } from "react";
import { Loader2, Globe, AlertTriangle, RotateCw, X, ShieldCheck } from "lucide-react";
import { PersonCard } from "@/components/PersonCard";
import type { DiscoveredPerson, ResearchRunView } from "@/lib/research/types";

/**
 * Renders one research run in any lifecycle state:
 *  - running: query + animated "searching the web" line + elapsed + Cancel
 *  - done:    grouped discovered PersonCards with Accept-all / Dismiss-all and per-card actions
 *  - error:   the run error + Retry
 * Accept/Dismiss PATCH /api/research/[runId] and update local state so the queue reflects it.
 */
export function ResearchRunCard({
  run,
  elapsed,
  onCancel,
  onRetry,
  apolloEnabled = false,
}: {
  run: ResearchRunView;
  elapsed?: number;
  onCancel?: () => void;
  onRetry?: () => void;
  apolloEnabled?: boolean;
}) {
  const [people, setPeople] = useState<DiscoveredPerson[]>(run.people);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [validating, setValidating] = useState(false);
  const [validateMsg, setValidateMsg] = useState<string | null>(null);

  // Validate + enrich every contact in this run: format-check + Apollo cross-check existing emails,
  // and fill missing email/company/title/LinkedIn. Then re-pull the run so the cards show the new
  // verdicts (field_sources statuses) and filled values without a full page reload.
  async function validate() {
    setValidating(true);
    setValidateMsg(null);
    try {
      const res = await fetch("/api/contacts/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ researchRunId: run.id }),
      });
      const data = await res.json().catch(() => null);
      setValidateMsg(data?.message ?? (res.ok ? "Validation finished." : "Couldn't validate these contacts."));
      const refreshed = await fetch(`/api/research/${run.id}`);
      if (refreshed.ok) {
        const view = (await refreshed.json()) as { people?: DiscoveredPerson[] };
        if (Array.isArray(view.people)) setPeople(view.people);
      }
    } catch {
      setValidateMsg("Couldn't reach the validator.");
    } finally {
      setValidating(false);
    }
  }

  async function act(action: "accept" | "dismiss", contactId: string) {
    setPendingIds((prev) => new Set(prev).add(contactId));
    try {
      const res = await fetch(`/api/research/${run.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, contactId }),
      });
      if (res.ok) {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === contactId
              ? { ...p, reviewStatus: action === "accept" ? "accepted" : "dismissed" }
              : p,
          ),
        );
      }
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(contactId);
        return next;
      });
    }
  }

  async function actAll(action: "accept-all" | "dismiss-all") {
    const res = await fetch(`/api/research/${run.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const next = action === "accept-all" ? "accepted" : "dismissed";
      setPeople((prev) =>
        prev.map((p) => (p.reviewStatus === "review" ? { ...p, reviewStatus: next } : p)),
      );
    }
  }

  const pendingReview = people.filter((p) => p.reviewStatus === "review");

  return (
    <section className="rounded-xl border border-border bg-surface/60 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2">
            {run.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : run.status === "error" ? (
              <AlertTriangle className="h-4 w-4 text-danger" />
            ) : (
              <Globe className="h-4 w-4 text-accent" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground" title={run.query}>
              {run.query}
            </p>
            <p className="text-xs text-muted">
              {run.status === "running"
                ? `Searching the web…${typeof elapsed === "number" ? ` ${elapsed}s` : ""}`
                : run.status === "error"
                  ? run.error ?? "Run failed."
                  : `${run.resultCount} ${run.resultCount === 1 ? "person" : "people"} found · web research`}
            </p>
          </div>
        </div>

        {run.status === "done" && people.length > 0 && (
          <button
            type="button"
            onClick={() => void validate()}
            disabled={validating}
            title={
              apolloEnabled
                ? "Format-check + Apollo.io cross-check each contact's email, and fill any missing email / company / title / LinkedIn."
                : "Format-check each contact's email and LinkedIn. Set APOLLO_API_KEY to also cross-check against Apollo and fill missing emails."
            }
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
          >
            {validating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {validating ? "Validating…" : "Validate & enrich"}
          </button>
        )}
        {run.status === "running" && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
        {run.status === "error" && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Retry
          </button>
        )}
      </header>

      {validateMsg && <p className="mt-3 text-xs text-muted-strong">{validateMsg}</p>}

      {run.status === "done" && people.length > 0 && (
        <div className="mt-4 space-y-3">
          {pendingReview.length > 1 && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => actAll("dismiss-all")}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-danger"
              >
                Dismiss all
              </button>
              <button
                type="button"
                onClick={() => actAll("accept-all")}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
              >
                Accept all ({pendingReview.length})
              </button>
            </div>
          )}
          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              pending={pendingIds.has(p.id)}
              onAccept={() => act("accept", p.id)}
              onDismiss={() => act("dismiss", p.id)}
            />
          ))}
        </div>
      )}

      {run.status === "done" && people.length === 0 && (
        <p className="mt-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
          No verifiable matches. Every candidate must be backed by a real web citation — anything the
          model couldn&apos;t prove was dropped rather than guessed.
        </p>
      )}
    </section>
  );
}
