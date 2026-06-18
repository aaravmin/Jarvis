"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Sparkles, Loader2, Check, Plus } from "lucide-react";
import type { GoalEntityType } from "@/lib/goals/types";

type G = { id: string; title: string };

/** A compact "anchor this to a goal" control for entity cards: link to a goal, or let Jarvis suggest. */
export function AddToGoal({ entityType, entityId }: { entityType: GoalEntityType; entityId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState<G[]>([]);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || goals.length) return;
    fetch("/api/goals")
      .then((r) => (r.ok ? r.json() : { goals: [] }))
      .then((d) => setGoals((d.goals ?? []) as G[]))
      .catch(() => {});
  }, [open, goals.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function link(goalId: string) {
    setBusy(goalId);
    try {
      const res = await fetch("/api/goal-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goalId, entityType, entityId }),
      });
      if (res.ok) {
        setLinked((s) => new Set(s).add(goalId));
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("__suggest__");
    setNote(null);
    try {
      const res = await fetch("/api/entities/suggest-goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      const data = await res.json();
      if (res.ok) {
        setNote(data.created ? `${data.created} suggestion${data.created === 1 ? "" : "s"} — review on the goal page` : (data.message ?? "No clear fit"));
        router.refresh();
      } else setNote(data?.error ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
        title="Anchor to a goal"
      >
        <Target className="h-3.5 w-3.5" /> Goals
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl">
          <button
            type="button"
            onClick={() => void suggest()}
            disabled={busy === "__suggest__"}
            className="flex w-full items-center gap-1.5 border-b border-border px-3 py-2 text-left text-xs text-accent hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "__suggest__" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Suggest goals (AI)
          </button>
          {note && <p className="px-3 py-1.5 text-[11px] text-muted">{note}</p>}
          <div className="max-h-56 overflow-y-auto">
            {goals.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">No goals yet.</p>
            ) : (
              goals.map((g) => {
                const isLinked = linked.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => void link(g.id)}
                    disabled={busy === g.id || isLinked}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-muted-strong hover:bg-surface-2 hover:text-foreground disabled:opacity-70"
                  >
                    <span className="truncate">{g.title}</span>
                    {busy === g.id ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : isLinked ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 shrink-0 text-muted" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
