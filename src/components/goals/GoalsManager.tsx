"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Check, Pencil, Trash2, Loader2 } from "lucide-react";
import { ProfileForm } from "@/components/manual/ProfileForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GoalEntityType } from "@/lib/goals/types";
import type { GoalSummary } from "@/lib/goals/load";

const COUNT_LABEL: Record<GoalEntityType, string> = {
  item: "tasks/events",
  source: "messages",
  contact: "contacts",
  opportunity: "opportunities",
};

function countsText(goal: GoalSummary): string | null {
  const parts = (Object.keys(goal.countsByType) as GoalEntityType[])
    .filter((t) => t === "item" || t === "source")
    .map((t) => ({ t, n: goal.countsByType[t] }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${COUNT_LABEL[x.t]}`);
  if (goal.intersectionCount > 0) parts.push(`${goal.intersectionCount} shared`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Goals + sub-goals, a simple list (not a tree explorer): each top-level goal nests its sub-goals one
 * level, with an "Add sub-goal" affordance and inline create/edit/delete. Goals are entered by the
 * user only, there is no AI generation step (the LLM day-planner was removed for the same reason:
 * the model should not be doing something a person can just tell Otto directly).
 */
export function GoalsManager({ initialGoals }: { initialGoals: GoalSummary[] }) {
  const router = useRouter();
  const goals = initialGoals.filter((g) => g.reviewStatus !== "dismissed");
  const topLevel = goals.filter((g) => !g.parentGoalId);
  const childrenOf = (goalId: string) => goals.filter((g) => g.parentGoalId === goalId);

  const refresh = () => router.refresh();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <h1 className="text-base font-semibold tracking-tight text-foreground">Goals</h1>

      <AddGoal onChanged={refresh} />
      <ProfileForm />

      {topLevel.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="text-sm font-semibold text-foreground">No goals yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Add what you are working toward. Otto flags anything relevant to it.
          </p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-md border bg-card">
          {topLevel.map((g) => (
            <GoalRow key={g.id} goal={g} subGoals={childrenOf(g.id)} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalRow({ goal, subGoals, onChanged }: { goal: GoalSummary; subGoals: GoalSummary[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = countsText(goal);

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
    <div className="px-3 py-2.5">
      {editing ? (
        <EditGoalForm goal={goal} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex items-start justify-between gap-3">
          <Link href={`/goals/${goal.id}`} className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground hover:text-primary">{goal.title}</p>
            {goal.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{goal.description}</p>}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {meta && <span className="text-[11px] text-muted-foreground">{meta}</span>}
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-xs" title="Add sub-goal" onClick={() => setAddingSub((v) => !v)}>
                <Plus />
              </Button>
              <Button variant="ghost" size="icon-xs" title="Edit" onClick={() => setEditing(true)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Delete"
                onClick={() => void remove()}
                disabled={busy}
                className="text-muted-foreground hover:text-destructive"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </div>
          </div>
        </div>
      )}

      {addingSub && (
        <div className="mt-2.5 border-t pt-2.5">
          <AddSubGoalForm parentGoalId={goal.id} onDone={() => { setAddingSub(false); onChanged(); }} />
        </div>
      )}

      {subGoals.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-t pt-2.5">
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
      <li className="ml-5">
        <EditGoalForm goal={goal} compact onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="ml-5 flex items-start justify-between gap-2 rounded-md border bg-secondary/30 px-2.5 py-1.5">
      <Link href={`/goals/${goal.id}`} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground hover:text-primary">{goal.title}</p>
        {goal.description && <p className="truncate text-xs text-muted-foreground">{goal.description}</p>}
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon-xs" title="Edit" onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Delete"
          onClick={() => void remove()}
          disabled={busy}
          className="text-muted-foreground hover:text-destructive"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
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
    <div className={compact ? "rounded-md border border-primary/40 bg-secondary/30 p-2 space-y-1.5" : "space-y-1.5"}>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Goal title *" />
      {!compact && (
        <Textarea
          className="min-h-[2.5rem]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
        />
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy || title.trim().length < 2}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
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
      className="ml-5 flex items-center gap-2"
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={busy}
        placeholder="Sub-goal title"
        className="h-8"
      />
      <Button type="submit" size="sm" disabled={busy || title.trim().length < 2}>
        Add
      </Button>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
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
    <div className="rounded-md border bg-card p-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
          placeholder="e.g. Grow a respected AI + social-impact consortium"
          className="h-8 flex-1"
        />
        <Button type="submit" size="sm" disabled={busy || title.trim().length < 2}>
          <Plus /> Add
        </Button>
      </form>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
