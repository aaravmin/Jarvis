"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * Toolbar for the People tab. "Sync outreach from email" deterministically advances contacts you've
 * corresponded with to "Spoke" (manual edits are never overwritten). The Google Sheets export button
 * is added alongside once write scopes are granted.
 */
export function ContactsToolbar() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contacts/sync-outreach", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.error ?? "Sync failed.");
      } else {
        setMsg(
          data.updated > 0
            ? `Updated ${data.updated} contact${data.updated === 1 ? "" : "s"} to “Spoke”.`
            : "No new correspondence found.",
        );
        if (data.updated > 0) router.refresh();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        Sync outreach from email
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
