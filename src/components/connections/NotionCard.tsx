"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookText, RefreshCw, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type SyncResponse = {
  enabled?: boolean;
  imported?: number;
  itemsExtracted?: number;
  message?: string;
  error?: string;
};

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "connected")
    return (
      <p className="mt-3 flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" /> Notion connected. Your recent pages are syncing.
      </p>
    );
  if (status === "disconnected")
    return <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">Notion disconnected.</p>;
  const detail =
    status === "error:not_configured"
      ? "This deployment has no Notion OAuth app yet (NOTION_CLIENT_ID / NOTION_CLIENT_SECRET)."
      : status === "error:migration_0023"
        ? "Apply migration 0023_notion_provider.sql in the Supabase SQL editor, then connect again."
        : `Couldn't connect Notion (${status.replace(/^error:/, "")}). Try again.`;
  return (
    <p className="mt-3 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      <AlertTriangle className="h-4 w-4 shrink-0" /> {detail}
    </p>
  );
}

/**
 * Notion connector card for the Connections page. PER-USER: each user connects their own Notion via
 * OAuth and picks the pages Jarvis may read; the token is stored server-side, RLS-scoped. Read-only,
 * Jarvis never writes back to Notion (hard rule #1). `envFallback` marks a self-hosted instance
 * running on a deployment-wide NOTION_API_KEY instead of a per-user connection.
 */
export function NotionCard({
  connected,
  workspaceName,
  canConnect,
  envFallback,
  status,
}: {
  connected: boolean;
  workspaceName?: string;
  canConnect: boolean;
  envFallback: boolean;
  status?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState<boolean | null>(null);

  const syncable = connected || envFallback;

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
            <p className="text-xs text-muted">
              {connected
                ? `Connected${workspaceName ? ` · ${workspaceName}` : ""}`
                : envFallback
                  ? "Using this deployment's integration key"
                  : "Not connected"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncable && (
            <button
              type="button"
              onClick={() => void sync()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft/40 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync
            </button>
          )}
          {connected ? (
            <form action="/api/connect/notion/disconnect" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger/50 hover:text-danger"
              >
                Disconnect
              </button>
            </form>
          ) : canConnect ? (
            <a
              href="/api/connect/notion"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              Connect Notion
            </a>
          ) : null}
        </div>
      </div>

      <StatusBanner status={status} />

      {msg && (
        <p className={`mt-3 text-xs ${ok === false ? "text-danger" : ok === true ? "text-success" : "text-muted"}`}>
          {msg}
        </p>
      )}

      <p className="mt-3 text-[11px] text-muted">
        {connected
          ? "Jarvis reads only the pages you granted. Manage access from Notion's Connections settings."
          : canConnect
            ? "Connecting opens Notion, where you pick exactly which pages Jarvis may read. Read-only."
            : envFallback
              ? "Self-hosted mode: pages shared with this deployment's internal integration are synced."
              : "Notion isn't set up on this deployment yet (needs NOTION_CLIENT_ID / NOTION_CLIENT_SECRET, or NOTION_API_KEY for a personal instance)."}
      </p>
    </section>
  );
}
