/**
 * The shared "sync all accounts" flow, used by the manual Sync all button and by Today's auto-sync
 * on open. Hits email, calendar, and (when configured) Notion in sequence, best-effort: a failure on
 * one endpoint is recorded and the rest still run. Returns an honest one-line summary of the email
 * sync plus any pending-migration degrade note.
 */

export type SyncAllOutcome = { failed: string[]; summary: string | null; degradeNote: string | null };

/** Honest one-line summary of what the email sync did (new mail, candidates kept, follow-ups closed). */
export function emailSummary(d: Record<string, unknown>): string | null {
  const bits = [
    typeof d.imported === "number" ? `${d.imported} new` : null,
    typeof d.candidatesFound === "number" && d.candidatesFound > 0
      ? `${d.candidatesFound} candidate${d.candidatesFound === 1 ? "" : "s"}, ${(d.itemsKept as number) ?? 0} kept`
      : null,
    typeof d.followUpsClosed === "number" && d.followUpsClosed > 0
      ? `${d.followUpsClosed} follow-up${d.followUpsClosed === 1 ? "" : "s"} auto-closed`
      : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

export async function syncAllAccounts(notionEnabled: boolean): Promise<SyncAllOutcome> {
  const endpoints = [
    { url: "/api/google/sync-email", label: "email" },
    { url: "/api/google/sync-calendar", label: "calendar" },
    ...(notionEnabled ? [{ url: "/api/notion/sync", label: "Notion" }] : []),
  ];
  const failed: string[] = [];
  let summary: string | null = null;
  let degradeNote: string | null = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, { method: "POST" });
      if (!res.ok) {
        failed.push(ep.label);
        continue;
      }
      if (ep.label === "email") {
        const d = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (d) {
          summary = emailSummary(d);
          if (typeof d.degradeNote === "string") degradeNote = d.degradeNote;
        }
      }
    } catch {
      failed.push(ep.label);
    }
  }
  return { failed, summary, degradeNote };
}
