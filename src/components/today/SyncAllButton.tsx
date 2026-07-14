"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderSync, Loader2 } from "lucide-react";
import { syncAllAccounts } from "@/components/today/sync-all";

/**
 * One button to bring everything current: syncs email, calendar, and (when configured) Notion in
 * sequence, then refreshes the feed. Lives on Today so staying up to date never requires visiting
 * three tabs. Each endpoint is best-effort; the first failure is surfaced, the rest still run. Shares
 * the exact flow Today uses for auto-sync-on-open (see ./sync-all.ts).
 */
export function SyncAllButton({ notionEnabled }: { notionEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "danger" | "muted" } | null>(null);

  async function syncAll() {
    setBusy(true);
    setNote(null);
    const { failed, summary, degradeNote } = await syncAllAccounts(notionEnabled);
    setBusy(false);
    if (failed.length) {
      setNote({ text: `Could not sync ${failed.join(", ")}. Check Connections.`, tone: "danger" });
    } else if (summary || degradeNote) {
      setNote({ text: [summary, degradeNote].filter(Boolean).join(" · "), tone: "muted" });
    } else {
      setNote(null);
    }
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
      {note && (
        <span className={`text-[11px] ${note.tone === "danger" ? "text-danger" : "text-muted"}`}>{note.text}</span>
      )}
    </span>
  );
}
