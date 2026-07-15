"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <p className="mt-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
        Notion connected. Your recent pages are syncing.
      </p>
    );
  if (status === "disconnected")
    return <p className="mt-2 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">Notion disconnected.</p>;
  const detail =
    status === "error:not_configured"
      ? "This deployment has no Notion OAuth app yet (NOTION_CLIENT_ID / NOTION_CLIENT_SECRET)."
      : status === "error:migration_0023"
        ? "Apply migration 0023_notion_provider.sql in the Supabase SQL editor, then connect again."
        : `Couldn't connect Notion (${status.replace(/^error:/, "")}). Try again.`;
  return <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{detail}</p>;
}

/**
 * Notion connector row for the Connections sheet. PER-USER: each user connects their own Notion via
 * OAuth and picks the pages GOTT may read; the token is stored server-side, RLS-scoped. Read-only,
 * GOTT never writes back to Notion (hard rule #1). `envFallback` marks a self-hosted instance
 * running on a deployment-wide NOTION_API_KEY instead of a per-user connection. Renders as a row (no
 * outer border) so it sits inside ConnectionsPanel's divided sheet, beside the Google row.
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
  const note = connected
    ? "Reads only the pages you've granted access to."
    : canConnect
      ? "Opens Notion to pick which pages GOTT can read."
      : envFallback
        ? "Pages shared with the integration sync automatically."
        : "Not configured on this deployment.";

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
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Notion</p>
          <p className="text-xs text-muted-foreground">
            {connected
              ? `Connected${workspaceName ? ` · ${workspaceName}` : ""}`
              : envFallback
                ? "Using this deployment's integration key"
                : "Not connected"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {syncable && (
            <Button variant="outline" size="sm" onClick={() => void sync()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Sync
            </Button>
          )}
          {connected ? (
            <form action="/api/connect/notion/disconnect" method="post">
              <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                Disconnect
              </Button>
            </form>
          ) : canConnect ? (
            <Button asChild size="sm">
              <a href="/api/connect/notion">Connect Notion</a>
            </Button>
          ) : null}
        </div>
      </div>

      <StatusBanner status={status} />

      {msg && (
        <p className={`mt-2 text-xs ${ok === false ? "text-destructive" : ok === true ? "text-success" : "text-muted-foreground"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
