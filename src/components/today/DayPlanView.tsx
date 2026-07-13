"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sun, Target, Link2 } from "lucide-react";
import { Card } from "@/components/Card";
import { formatWhen, formatEventTime } from "@/lib/format";
import { BUCKET_META, BUCKET_ORDER } from "@/lib/priority/score";
import type { AttentionEntry, AttentionFeed, Bucket } from "@/lib/priority/types";

/**
 * The Today "attention" surface. Fetches the deterministic feed (/api/today/plan) and renders each
 * bucket as a plain list, red header for overdue, green for done, goal tags as small chips, provenance
 * via <Card>. Intentionally minimal, T4 owns the real design; this only has to be correct and green.
 */

function headerTone(tone: (typeof BUCKET_META)[Bucket]["tone"]): string {
  if (tone === "danger") return "text-danger";
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  return "text-muted-strong";
}

function timeLabel(entry: AttentionEntry): string {
  if (entry.origin === "calendar") return formatEventTime(entry.startsAt ?? undefined, entry.endsAt ?? undefined, entry.allDay);
  if (entry.dueAt) return `Due ${formatWhen(entry.dueAt)}`;
  return "";
}

export function DayPlanView() {
  const [feed, setFeed] = useState<AttentionFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/today/plan", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Couldn't load your day.");
      else setFeed(data as AttentionFeed);
    } catch {
      setError("Network error loading your day.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Sun className="h-6 w-6 animate-pulse text-accent" />
        <p className="text-sm text-muted">Sorting your tasks, follow-ups, and calendar by what matters most…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        <RefreshButton onClick={load} />
      </div>
    );
  }

  const total = feed ? BUCKET_ORDER.reduce((n, b) => n + feed.buckets[b].length, 0) : 0;

  if (!feed || total === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-surface-2">
          <Sun className="h-6 w-6 text-accent" strokeWidth={1.75} />
        </span>
        <h2 className="text-base font-semibold text-foreground">Nothing needs your attention</h2>
        <p className="max-w-sm text-sm text-muted">
          No open items or upcoming events. Connect Google and sync, or add a task, and Jarvis will order everything
          here by importance.
        </p>
        <RefreshButton onClick={load} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent">
            <Sun className="h-3.5 w-3.5" /> Today
          </p>
          <h1 className="mt-1 text-lg font-semibold text-foreground">What matters most</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-strong">
            Ordered by importance, grounded in your goals. Dates are resolved by code, never guessed.
          </p>
        </div>
        <RefreshButton onClick={load} compact />
      </header>

      {BUCKET_ORDER.map((bucket) => {
        const entries = feed.buckets[bucket];
        if (!entries.length) return null;
        const meta = BUCKET_META[bucket];
        return (
          <section key={bucket} className="space-y-3">
            <h2 className={`text-xs font-semibold uppercase tracking-wider ${headerTone(meta.tone)}`}>
              {meta.label} <span className="text-muted">({entries.length})</span>
            </h2>
            <ul className="space-y-3">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <EntryCard entry={entry} label={timeLabel(entry)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EntryCard({ entry, label }: { entry: AttentionEntry; label: string }) {
  return (
    <Card
      title={entry.title}
      source={entry.source}
      reasoning={entry.reasoning ?? undefined}
      meta={label ? <span className="whitespace-nowrap">{label}</span> : undefined}
    >
      {(entry.goalTags.length > 0 || entry.meetingTopics.length > 0) && (
        <div className="space-y-2">
          {entry.goalTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {entry.goalTags.map((g) => (
                <span
                  key={g.goalId}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft/40 px-2 py-0.5 text-[11px] text-foreground"
                >
                  <Target className="h-3 w-3" strokeWidth={2} />
                  {g.title}
                </span>
              ))}
            </div>
          )}
          {entry.meetingTopics.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <Link2 className="h-3 w-3" strokeWidth={2} />
              <span className="text-muted-strong">Related:</span>
              {entry.meetingTopics.map((t) => t.title).join(", ")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function RefreshButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 text-sm text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {compact ? "Refresh" : "Try again"}
    </button>
  );
}
