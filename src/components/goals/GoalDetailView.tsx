"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GoalDetail } from "@/lib/goals/load";

const TYPE_TAG =
  "inline-flex items-center rounded border border-border px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground";

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
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div>
        <Link href="/goals" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Goals
        </Link>
        <h1 className="mt-1 text-base font-semibold tracking-tight text-foreground">{goal.title}</h1>
        {goal.description && <p className="mt-0.5 text-sm text-muted-foreground">{goal.description}</p>}
      </div>

      {/* Intersections, entities serving this goal AND others */}
      {intersections.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">Intersections</h2>
          <div className="divide-y overflow-hidden rounded-md border bg-card">
            {intersections.map((x) => (
              <IntersectionCard key={`${x.entityType}:${x.entityId}`} x={x} onChanged={() => router.refresh()} />
            ))}
          </div>
        </section>
      )}

      {/* Suggested links (L0) */}
      {suggested.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-sm font-semibold text-foreground">Suggested links</h2>
          <div className="divide-y overflow-hidden rounded-md border bg-card">
            {suggested.map((e) => (
              <div key={e.linkId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{e.label}</p>
                  {e.rationale && <p className="truncate text-xs text-muted-foreground">{e.rationale}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void linkAction(e.linkId, "dismiss")}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X />
                  </Button>
                  <Button size="sm" onClick={() => void linkAction(e.linkId, "accept")}>
                    <Check />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Linked entities */}
      <section className="space-y-1.5">
        <h2 className="text-sm font-semibold text-foreground">Linked ({accepted.length})</h2>
        {accepted.length === 0 ? (
          <p className="rounded-md border border-dashed bg-card px-3 py-4 text-center text-xs text-muted-foreground">
            Nothing linked yet.
          </p>
        ) : (
          <div className="divide-y overflow-hidden rounded-md border bg-card">
            {accepted.map((e) => (
              <div key={e.linkId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className={TYPE_TAG}>{e.entityType}</span>{" "}
                  {e.href ? (
                    <Link href={e.href} className="text-sm text-foreground hover:text-primary">{e.label}</Link>
                  ) : (
                    <span className="text-sm text-foreground">{e.label}</span>
                  )}
                  {e.sublabel && <span className="ml-1 text-xs text-muted-foreground">· {e.sublabel}</span>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Unlink"
                  onClick={() => void unlink(e.linkId)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Connections to other goals */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Connections</h2>
          <Button variant="outline" size="sm" onClick={() => void generateConnections()} disabled={connBusy}>
            {connBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Find connections
          </Button>
        </div>
        {connections.length === 0 ? (
          <p className="text-xs text-muted-foreground">No connections yet.</p>
        ) : (
          <div className="divide-y overflow-hidden rounded-md border bg-card">
            {connections.map((c) => (
              <div key={c.id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/goals/${c.otherGoalId}`} className="text-sm font-medium text-foreground hover:text-primary">
                    {c.otherGoalTitle}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">{c.sharedCount} shared</span>
                </div>
                {c.rationale && <p className="mt-0.5 text-xs text-muted-foreground">{c.rationale}</p>}
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
    <div className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {x.label} <span className="text-xs font-normal text-muted-foreground">serves {x.goals.length} goals</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{x.goals.map((g) => g.title).join(" · ")}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Dismiss"
          onClick={() => void dismiss()}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <X />
        </Button>
      </div>
      {suggestion ? (
        <p className="mt-2 rounded-md bg-secondary/40 px-2.5 py-2 text-sm leading-relaxed text-foreground">{suggestion}</p>
      ) : (
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void generate()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Draft one combined ask
        </Button>
      )}
    </div>
  );
}
