"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, GitMerge, Sparkles, Loader2, Check, X, Link2 } from "lucide-react";
import type { GoalDetail } from "@/lib/goals/load";

export function GoalDetailView({ detail }: { detail: GoalDetail }) {
  const router = useRouter();
  const { goal, entities, intersections, connections } = detail;
  const accepted = entities.filter((e) => e.reviewStatus === "accepted");
  const suggested = entities.filter((e) => e.reviewStatus === "review");
  const [connBusy, setConnBusy] = useState(false);

  async function linkAction(linkId: string, action: "accept" | "dismiss") {
    await fetch(`/api/goal-links/${linkId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  }
  async function unlink(linkId: string) {
    await fetch(`/api/goal-links/${linkId}`, { method: "DELETE" });
    router.refresh();
  }
  async function generateConnections() {
    setConnBusy(true);
    try {
      await fetch(`/api/goals/${goal.id}/connections`, { method: "POST" });
      router.refresh();
    } finally {
      setConnBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/goals" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Goals
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{goal.title}</h1>
        {goal.description && <p className="mt-1 text-sm text-muted">{goal.description}</p>}
      </div>

      {/* Intersections, entities serving this goal AND others */}
      {intersections.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <GitMerge className="h-4 w-4 text-accent" /> Intersections
          </h2>
          <div className="space-y-2">
            {intersections.map((x) => (
              <IntersectionCard key={`${x.entityType}:${x.entityId}`} x={x} onChanged={() => router.refresh()} />
            ))}
          </div>
        </section>
      )}

      {/* Suggested links (L0) */}
      {suggested.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Suggested links</h2>
          <div className="space-y-2">
            {suggested.map((e) => (
              <div key={e.linkId} className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{e.label}</p>
                  {e.rationale && <p className="truncate text-xs text-muted">{e.rationale}</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => void linkAction(e.linkId, "dismiss")} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-danger">
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => void linkAction(e.linkId, "accept")} className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-strong">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Linked entities */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Linked ({accepted.length})</h2>
        {accepted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface/40 px-3 py-4 text-center text-xs text-muted">
            Nothing linked yet. Accept a goal-tagged item in Review and it will show up here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {accepted.map((e) => (
              <div key={e.linkId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="min-w-0">
                  <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">{e.entityType}</span>{" "}
                  {e.href ? (
                    <Link href={e.href} className="text-sm text-foreground hover:text-accent">{e.label}</Link>
                  ) : (
                    <span className="text-sm text-foreground">{e.label}</span>
                  )}
                  {e.sublabel && <span className="ml-1 text-xs text-muted">· {e.sublabel}</span>}
                </div>
                <button type="button" onClick={() => void unlink(e.linkId)} title="Unlink" className="shrink-0 rounded-md p-1 text-muted hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Connections to other goals */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Link2 className="h-4 w-4 text-accent" /> Connections
          </h2>
          <button
            type="button"
            onClick={() => void generateConnections()}
            disabled={connBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
          >
            {connBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Find connections
          </button>
        </div>
        {connections.length === 0 ? (
          <p className="text-xs text-muted">No connections yet, “Find connections” looks for goals that share an entity with this one.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/goals/${c.otherGoalId}`} className="text-sm font-medium text-foreground hover:text-accent">{c.otherGoalTitle}</Link>
                  <span className="text-[11px] text-muted">{c.sharedCount} shared</span>
                </div>
                {c.rationale && <p className="mt-0.5 text-xs text-muted-strong">{c.rationale}</p>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function IntersectionCard({
  x,
  onChanged,
}: {
  x: GoalDetail["intersections"][number];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(x.suggestion);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/goal-intersections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType: x.entityType, entityId: x.entityId }),
      });
      const data = await res.json();
      if (res.ok && data.suggestion) setSuggestion(data.suggestion);
    } finally {
      setBusy(false);
    }
  }
  async function dismiss() {
    await fetch(`/api/goal-intersections?entityType=${x.entityType}&entityId=${x.entityId}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="rounded-lg border border-accent/30 bg-accent-soft/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {x.label} <span className="text-xs font-normal text-muted">serves {x.goals.length} goals</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">{x.goals.map((g) => g.title).join(" · ")}</p>
        </div>
        <button type="button" onClick={() => void dismiss()} title="Dismiss" className="shrink-0 rounded-md p-1 text-muted hover:text-danger">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {suggestion ? (
        <p className="mt-2 rounded-md bg-surface/60 px-2.5 py-2 text-sm leading-relaxed text-foreground">{suggestion}</p>
      ) : (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Draft one combined ask
        </button>
      )}
    </div>
  );
}
