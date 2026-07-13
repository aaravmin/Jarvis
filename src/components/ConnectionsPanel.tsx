"use client";

import { Plug, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import type { GoogleConnection } from "@/lib/google/store";
import { NotionCard } from "@/components/connections/NotionCard";

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "connected")
    return (
      <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" /> Google connected.
      </p>
    );
  if (status === "disconnected")
    return <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">Google disconnected.</p>;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      <AlertTriangle className="h-4 w-4" /> Couldn&apos;t connect Google ({status.replace(/^error:/, "")}). Try again.
    </p>
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
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Connections</h1>
        <p className="mt-1 text-sm text-muted">
          Connect Google and Notion so Jarvis can read your email, calendar, and notes. Everything
          stays read-only.
        </p>
      </header>

      <StatusBanner status={status} />

      <section className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface">
              <Plug className="h-4 w-4 text-accent" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Google</p>
              <p className="text-xs text-muted">
                {connection ? `Connected${connection.email ? ` · ${connection.email}` : ""}` : "Not connected"}
              </p>
            </div>
          </div>
          {connection ? (
            <div className="flex items-center gap-2">
              <a
                href="/api/connect/google"
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft/40"
                title="Re-run consent to grant any newly added permissions"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reconnect
              </a>
              <form action="/api/connect/google/disconnect" method="post">
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger/50 hover:text-danger"
                >
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/api/connect/google"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              Connect Google
            </a>
          )}
        </div>
        {connection?.scopes?.length ? (
          <p className="mt-3 text-[11px] text-muted">
            Scopes: {connection.scopes.map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(", ")}
          </p>
        ) : null}
      </section>

      <NotionCard
        connected={notion.connected}
        workspaceName={notion.workspaceName}
        canConnect={notion.canConnect}
        envFallback={notion.envFallback}
        status={notion.status}
      />

      {!connection && (
        <p className="text-sm text-muted">
          Once connected, sync your email and calendar from the Email and Calendar tabs; Jarvis turns
          them into sourced tasks and follow-ups in Review.
        </p>
      )}
    </div>
  );
}
