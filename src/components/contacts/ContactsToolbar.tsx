"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Sheet, ExternalLink, Loader2 } from "lucide-react";

/**
 * Toolbar for the People tab. "Sync outreach from email" deterministically advances contacts you've
 * corresponded with to "Spoke" (manual edits are never overwritten). "Export to Google Sheets" creates
 * a sheet of your full contact list with an editable status dropdown.
 */
export function ContactsToolbar() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

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

  async function exportSheet() {
    setExporting(true);
    setExportErr(null);
    setExportUrl(null);
    try {
      const res = await fetch("/api/contacts/export-sheet", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setExportErr(data?.error ?? "Export failed.");
      } else {
        setExportUrl(data.url);
        if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setExportErr("Network error.");
    } finally {
      setExporting(false);
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

      <button
        type="button"
        onClick={exportSheet}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground disabled:opacity-50"
      >
        {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
        Export to Google Sheets
      </button>

      {exportUrl && (
        <a
          href={exportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-success hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open sheet
        </a>
      )}
      {msg && <span className="text-xs text-muted">{msg}</span>}
      {exportErr && <span className="text-xs text-danger">{exportErr}</span>}
    </div>
  );
}
