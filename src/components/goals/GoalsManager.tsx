"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Target, Plus, Check, Pencil, Trash2, Loader2, CheckSquare, Mail, GitMerge } from "lucide-react";
import { ProfileForm } from "@/components/manual/ProfileForm";
import type { GoalSummary } from "@/lib/goals/load";

const TYPE_ICON = { item: CheckSquare, source: Mail } as const;
const TYPE_LABEL = { item: "tasks/events", source: "messages" } as const;

const ghostBtn =
  "inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50";
const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

/**
 * Goals + sub-goals, a simple list (not a tree explorer): each top-level goal nests its sub-goals one
 * level, with an "Add sub-goal" affordance and inline create/edit/delete. Goals are entered by the
 * user only, there is no AI generation step (the LLM day-planner was removed for the same reason:
 * the model should not be doing something a person can just tell Jarvis directly).
 */
export function GoalsManager({ initialGoals }: { initialGoals: GoalSummary[] }) {
  const router = useRouter();
  const goals = initialGoals.filter((g) => g.reviewStatus !== "dismissed");
  const topLevel = goals.filter((g) => !g.parentGoalId);
  const childrenOf = (goalId: string) => goals.filter((g) => g.parentGoalId === goalId);

  const refresh = () => router.refresh();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AddGoal onChanged={refresh} />
      <ProfileForm />

      {topLevel.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Target className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No goals yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Add what you are working toward. Jarvis flags anything in your email, meetings, and
            calendar that advances a goal.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {topLevel.map((g) => (
            <GoalCard key={g.id} goal={g} subGoals={childrenOf(g.id)} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function CountsRow({ goal }: { goal: GoalSummary }) {
  const badges = (Object.keys(TYPE_ICON) as (keyof typeof TYPE_ICON)[])
    .map((t) => ({ t, n: goal.countsByType[t] }))
    .filter((x) => x.n > 0);
  if (badges.length === 0) return <p className="mt-2 text-xs text-muted/70">Nothing linked yet</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
      {badges.map(({ t, n }) => {
        const Icon = TYPE_ICON[t];
        return (
          <span key={t} className="inline-flex items-center gap-1">
            <Icon className="h-3.5 w-3.5 text-accent/80" /> {n} {TYPE_LABEL[t]}
          </span>
        );
      })}
    </div>
  );
}

function GoalCard({ goal, subGoals, onChanged }: { goal: GoalSummary; subGoals: GoalSummary[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this goal and its sub-goals? This can't be undone.")) return;
    setBusy(true);
    try {
      await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      {editing ? (
        <EditGoalForm goal={goal} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <Link href={`/goals/${goal.id}`} className="group min-w-0 flex-1">
              <h3 className="font-semibold leading-snug text-foreground group-hover:text-accent">{goal.title}</h3>
              {goal.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{goal.description}</p>}
            </Link>
            {goal.intersectionCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
                <GitMerge className="h-3 w-3" />
                {goal.intersectionCount}
              </span>
            )}
          </div>

          <CountsRow goal={goal} />

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setAddingSub((v) => !v)} className={ghostBtn}>
              <Plus className="h-3.5 w-3.5" /> Add sub-goal
            </button>
            <button type="button" onClick={() => setEditing(true)} className={ghostBtn}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button type="button" onClick={() => void remove()} disabled={busy} className={`${ghostBtn} hover:text-danger`}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
            </button>
          </div>
        </>
      )}

      {addingSub && (
        <div className="mt-3 border-t border-border pt-3">
          <AddSubGoalForm parentGoalId={goal.id} onDone={() => { setAddingSub(false); onChanged(); }} />
        </div>
      )}

      {subGoals.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {subGoals.map((sg) => (
            <SubGoalRow key={sg.id} goal={sg} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SubGoalRow({ goal, onChanged }: { goal: GoalSummary; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Delete this sub-goal? This can't be undone.")) return;
    setBusy(true);
    try {
      await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="ml-4 sm:ml-6">
        <EditGoalForm goal={goal} compact onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="ml-4 flex items-start justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 sm:ml-6">
      <Link href={`/goals/${goal.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground hover:text-accent">{goal.title}</p>
        {goal.description && <p className="truncate text-xs text-muted">{goal.description}</p>}
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={() => setEditing(true)} title="Edit" className="rounded-md p-1.5 text-muted hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => void remove()} disabled={busy} title="Delete" className="rounded-md p-1.5 text-muted hover:text-danger disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </li>
  );
}

function EditGoalForm({
  goal,
  compact = false,
  onSaved,
  onCancel,
}: {
  goal: GoalSummary;
  compact?: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (title.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data?.error ?? "Could not save.");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "rounded-lg border border-accent/40 bg-surface p-2.5" : "space-y-2"}>
      <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goal title *" />
      {!compact && (
        <textarea
          className={`${input} min-h-[2.5rem] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || title.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddSubGoalForm({ parentGoalId, onDone }: { parentGoalId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function add() {
    if (title.trim().length < 2) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, parentGoalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(data?.error ?? "Could not add sub-goal.");
        return;
      }
      if (data?.warning) setNote(data.warning);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
      className="ml-4 flex items-center gap-2 sm:ml-6"
    >
      <Target className="h-3.5 w-3.5 shrink-0 text-accent" />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        placeholder="Sub-goal title"
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={busy || title.trim().length < 2}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
      >
        Add
      </button>
      {note && <p className="text-xs text-muted">{note}</p>}
    </form>
  );
}

function AddGoal({ onChanged }: { onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
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

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="flex items-center gap-2"
      >
        <Target className="h-4 w-4 shrink-0 text-accent" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder="e.g. Grow a respected AI + social-impact consortium"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || title.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
