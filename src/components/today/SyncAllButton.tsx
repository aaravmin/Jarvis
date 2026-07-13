"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderSync, Loader2 } from "lucide-react";

/**
 * One button to bring everything current: syncs email, calendar, and (when configured) Notion in
 * sequence, then refreshes the feed. Lives on Today so staying up to date never requires visiting
 * three tabs. Each endpoint is best-effort; the first failure is surfaced, the rest still run.
 */
export function SyncAllButton({ notionEnabled }: { notionEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function syncAll() {
    setBusy(true);
    setNote(null);
    const endpoints = [
      { url: "/api/google/sync-email", label: "email" },
      { url: "/api/google/sync-calendar", label: "calendar" },
      ...(notionEnabled ? [{ url: "/api/notion/sync", label: "Notion" }] : []),
    ];
    const failed: string[] = [];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, { method: "POST" });
        if (!res.ok) failed.push(ep.label);
      } catch {
        failed.push(ep.label);
      }
    }
    setBusy(false);
    setNote(failed.length ? `Could not sync ${failed.join(", ")}. Check Connections.` : null);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void syncAll()}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderSync className="h-3.5 w-3.5" />}
        Sync all
      </button>
      {note && <span className="text-[11px] text-danger">{note}</span>}
    </span>
  );
}
