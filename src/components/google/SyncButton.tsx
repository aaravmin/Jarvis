"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";

/** A small "Sync from Google" button that POSTs to an ingest endpoint and refreshes the page. */
export function SyncButton({ endpoint, label }: { endpoint: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setMsg(d?.error ?? "Sync failed.");
      } else {
        // Surface the honest engine counts: new mail, candidates-vs-kept from extraction, and any
        // follow-ups the reply-tracker auto-closed. Other endpoints (calendar) only send `imported`.
        const bits = [
          typeof d.imported === "number" ? `${d.imported} new` : null,
          typeof d.candidatesFound === "number" && d.candidatesFound > 0
            ? `${d.candidatesFound} candidate${d.candidatesFound === 1 ? "" : "s"}, ${d.itemsKept ?? 0} kept`
            : d.itemsExtracted
              ? `${d.itemsExtracted} to review`
              : null,
          d.followUpsClosed ? `${d.followUpsClosed} follow-up${d.followUpsClosed === 1 ? "" : "s"} auto-closed` : null,
        ].filter(Boolean);
        const base = bits.length ? bits.join(" · ") : "Up to date";
        setMsg(d.degradeNote ? `${base} · ${d.degradeNote}` : base);
        router.refresh();
      }
    } catch {
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {label}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
