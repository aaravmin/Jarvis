"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Target, Plus, Sparkles, Loader2, Check, X, Users, Compass, CheckSquare, Mail, GitMerge } from "lucide-react";
import { ProfileForm } from "@/components/manual/ProfileForm";
import type { GoalSummary } from "@/lib/goals/load";

const TYPE_ICON = { contact: Users, opportunity: Compass, item: CheckSquare, source: Mail } as const;
const TYPE_LABEL = { contact: "contacts", opportunity: "opportunities", item: "tasks/events", source: "messages" } as const;

export function GoalsManager({ initialGoals }: { initialGoals: GoalSummary[] }) {
  const router = useRouter();
  const goals = initialGoals;
  const accepted = goals.filter((g) => g.reviewStatus === "accepted");
  const review = goals.filter((g) => g.reviewStatus === "review");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AddGoal onChanged={() => router.refresh()} />
      <ProfileForm />

      {review.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Suggested goals</p>
          {review.map((g) => (
            <ReviewGoalRow key={g.id} goal={g} onChanged={() => router.refresh()} />
          ))}
        </section>
      )}

      {accepted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Target className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No goals yet</h2>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accepted.map((g) => (
            <Link
              key={g.id}
              href={`/goals/${g.id}`}
              className="group rounded-xl border border-border bg-surface-2 p-4 transition-colors hover:border-accent/50"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug text-foreground">{g.title}</h3>
                {g.intersectionCount > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent-soft/40 px-2 py-0.5 text-[11px] text-accent">
                    <GitMerge className="h-3 w-3" />
                    {g.intersectionCount}
                  </span>
                )}
              </div>
              {g.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{g.description}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
                {(Object.keys(TYPE_ICON) as (keyof typeof TYPE_ICON)[]).map((t) => {
                  const n = g.countsByType[t];
                  if (!n) return null;
                  const Icon = TYPE_ICON[t];
                  return (
                    <span key={t} className="inline-flex items-center gap-1">
                      <Icon className="h-3.5 w-3.5 text-accent/80" /> {n} {TYPE_LABEL[t]}
                    </span>
                  );
                })}
                {g.linkCount === 0 && <span className="text-muted/70">Nothing linked yet</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AddGoal({ onChanged }: { onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function createManual() {
    if (title.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Could not add goal.");
      else {
        setTitle("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (context.trim().length < 10) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/goals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Generation failed.");
      else {
        setContext("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${mode === "manual" ? "bg-accent text-[#04181f]" : "border border-border text-muted hover:text-foreground"}`}
        >
          <Plus className="mr-1 inline h-3.5 w-3.5" /> Add a goal
        </button>
        <button
          type="button"
          onClick={() => setMode("ai")}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${mode === "ai" ? "bg-accent text-[#04181f]" : "border border-border text-muted hover:text-foreground"}`}
        >
          <Sparkles className="mr-1 inline h-3.5 w-3.5" /> From context
        </button>
      </div>

      {mode === "manual" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createManual();
          }}
          className="flex items-center gap-2"
        >
          <Target className="h-4 w-4 shrink-0 text-accent" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            placeholder="e.g. Build a startup called FinePrint"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={busy || title.trim().length < 2}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
          >
            Add
          </button>
        </form>
      ) : (
        <div className="space-y-2">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="Brain-dump what you're working toward — Jarvis turns it into goals. e.g. 'I'm a freshman who wants to build a startup, break into tech, and land a summer internship.'"
            className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || context.trim().length < 10}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate goals
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}

function ReviewGoalRow({ goal, onChanged }: { goal: GoalSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  async function act(action: "accepted" | "dismissed") {
    setBusy(true);
    try {
      await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewStatus: action }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft/20 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
        {goal.description && <p className="truncate text-xs text-muted">{goal.description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => void act("dismissed")}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-danger disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void act("accepted")}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Keep
        </button>
      </div>
    </div>
  );
}
