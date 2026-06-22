"use client";

import { useState } from "react";
import { CONTACT_OUTREACH_STATUSES, type ContactOutreachStatus } from "@/lib/research/types";

/** Dot color per outreach state, quick visual scan down a list of contacts. */
const DOT: Record<ContactOutreachStatus, string> = {
  not_emailed: "bg-muted",
  emailed: "bg-accent",
  spoke: "bg-success",
  follow_up: "bg-warning",
};

/**
 * Outreach toggle on a contact (not emailed → emailed → spoke → follow up). Self-contained: owns the
 * current value, PATCHes /api/contacts/status, and rolls back on failure. Manual edits win over
 * auto-sync. The same status rides along to the Google Sheets export.
 */
export function ContactStatusControl({
  contactId,
  initial,
}: {
  contactId: string;
  initial: ContactOutreachStatus;
}) {
  const [status, setStatus] = useState<ContactOutreachStatus>(initial);
  const [pending, setPending] = useState(false);

  async function change(next: ContactOutreachStatus) {
    const prev = status;
    setStatus(next); // optimistic
    setPending(true);
    try {
      const res = await fetch("/api/contacts/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, outreachStatus: next }),
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
        onChange={(e) => change(e.target.value as ContactOutreachStatus)}
        aria-label="Outreach status"
        className="cursor-pointer bg-transparent text-muted-strong outline-none disabled:opacity-50"
      >
        {CONTACT_OUTREACH_STATUSES.map((s) => (
          <option key={s.value} value={s.value} className="bg-surface-2 text-foreground">
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
