"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <Button type="button" size="sm" onClick={() => void go()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {label}
      </Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
