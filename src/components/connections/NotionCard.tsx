"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookText, RefreshCw, Loader2 } from "lucide-react";

type SyncResponse = {
  enabled?: boolean;
  imported?: number;
  itemsExtracted?: number;
  message?: string;
  error?: string;
};

/**
 * Notion connector card for the Connections page (T3). Self-contained: fetches nothing on its own,
 * just POSTs /api/notion/sync and shows the result. Read-only — Jarvis never writes back to Notion
 * (hard rule #1: Supabase is the system of record). `enabled` is passed from the server (whether
 * NOTION_API_KEY is set) so the card can render its state without a client round-trip.
 */
export function NotionCard({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    setOk(null);
    try {
      const res = await fetch("/api/notion/sync", { method: "POST" });
      const d = (await res.json()) as SyncResponse;
      if (!res.ok) {
        setOk(false);
        setMsg(d?.error ?? "Notion sync failed.");
      } else {
        const success = d.enabled !== false && !d.error;
        setOk(success);
        setMsg(d.message ?? "Up to date");
        if (success) router.refresh();
      }
    } catch {
      setOk(false);
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface">
            <NotebookText className="h-4 w-4 text-accent" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Notion</p>
            <p className="text-xs text-muted">{enabled ? "Configured" : "Not configured"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void sync()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync Notion
        </button>
      </div>

      {msg && (
        <p className={`mt-3 text-xs ${ok === false ? "text-danger" : ok === true ? "text-success" : "text-muted"}`}>
          {msg}
        </p>
      )}

      <p className="mt-3 text-[11px] text-muted">
        Share pages with your integration in Notion, then set NOTION_API_KEY to enable syncing.
      </p>
    </section>
  );
}
