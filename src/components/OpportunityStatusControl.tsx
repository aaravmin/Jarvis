"use client";

import { useState } from "react";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/agents/opportunity/types";

/** Dot color per pipeline state, quick visual scan down a list of opportunities. */
const DOT: Record<ApplicationStatus, string> = {
  not_applied: "bg-muted",
  waiting_to_open: "bg-muted-strong",
  applied: "bg-accent",
  interviewing: "bg-warning",
  accepted: "bg-success",
  rejected: "bg-danger",
};

/**
 * Application-pipeline toggle shown on an accepted opportunity. Self-contained: owns the current
 * value, PATCHes /api/opportunities/status, and rolls back on failure. The LLM never touches this.
 */
export function OpportunityStatusControl({
  opportunityId,
  initial,
}: {
  opportunityId: string;
  initial: ApplicationStatus;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(initial);
  const [pending, setPending] = useState(false);

  async function change(next: ApplicationStatus) {
    const prev = status;
    setStatus(next); // optimistic
    setPending(true);
    try {
      const res = await fetch("/api/opportunities/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId, applicationStatus: next }),
      });
      if (!res.ok) setStatus(prev); // roll back
    } catch {
      setStatus(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} aria-hidden />
      <select
        value={status}
        disabled={pending}
        onChange={(e) => change(e.target.value as ApplicationStatus)}
        aria-label="Application status"
        className="cursor-pointer bg-transparent text-muted-strong outline-none disabled:opacity-50"
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s.value} value={s.value} className="bg-surface-2 text-foreground">
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
