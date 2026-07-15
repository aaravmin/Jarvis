"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoogleConnection } from "@/lib/google/store";
import { NotionCard } from "@/components/connections/NotionCard";

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "connected")
    return <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">Google connected.</p>;
  if (status === "disconnected")
    return <p className="rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground">Google disconnected.</p>;
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      Couldn&apos;t connect Google ({status.replace(/^error:/, "")}). Try again.
    </p>
  );
}

function GoogleRow({ connection }: { connection: GoogleConnection | null }) {
  return (
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Google</p>
          <p className="text-xs text-muted-foreground">
            {connection ? `Connected${connection.email ? ` · ${connection.email}` : ""}` : "Not connected"}
          </p>
          {connection?.scopes?.length ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Scopes: {connection.scopes.map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connection ? (
            <>
              <Button asChild variant="outline" size="sm" title="Re-run consent to grant any newly added permissions">
                <a href="/api/connect/google">
                  <RefreshCw /> Reconnect
                </a>
              </Button>
              <form action="/api/connect/google/disconnect" method="post">
                <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  Disconnect
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm">
              <a href="/api/connect/google">Connect Google</a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConnectionsPanel({
  connection,
  status,
  notion,
}: {
  connection: GoogleConnection | null;
  status?: string;
  notion: {
    connected: boolean;
    workspaceName?: string;
    canConnect: boolean;
    envFallback: boolean;
    status?: string;
  };
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-base font-semibold tracking-tight text-foreground">Connections</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Google and Notion, both read-only.</p>
      </header>

      <StatusBanner status={status} />

      <div className="divide-y overflow-hidden rounded-md border bg-card">
        <GoogleRow connection={connection} />
        <NotionCard
          connected={notion.connected}
          workspaceName={notion.workspaceName}
          canConnect={notion.canConnect}
          envFallback={notion.envFallback}
          status={notion.status}
        />
      </div>
    </div>
  );
}
