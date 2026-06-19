"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, CalendarClock, Reply } from "lucide-react";
import { formatDate } from "@/lib/format";

export type Task = {
  id: string;
  title: string;
  due_at: string | null;
  reasoning: string | null;
  status: string;
  item_type?: "task" | "event" | "follow_up";
};

// Events and follow-ups share this list with plain tasks; a small pill keeps them distinct. Tasks get
// no pill to avoid clutter (they're the default).
const TYPE_PILL: Record<"event" | "follow_up", { label: string; icon: typeof CalendarClock }> = {
  event: { label: "Event", icon: CalendarClock },
  follow_up: { label: "Follow-up", icon: Reply },
};

const input =
  "w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none placeholder:text-muted";

/**
 * One task row with the full manual loop the dashboard was missing: check it off (toggles
 * items.status done⇄accepted), edit its title/notes/due, or delete it. The due date is always
 * re-resolved server-side by chrono (hard rule #2) — this component only sends the raw phrase.
 */
export function TaskItem({ task }: { task: Task }) {
  const router = useRouter();
  const done = task.status === "done";
  const [busy, setBusy] = useState<null | "toggle" | "save" | "delete">(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [rawDue, setRawDue] = useState("");
  const [clearDue, setClearDue] = useState(false);
  const [notes, setNotes] = useState(task.reasoning ?? "");

  async function send(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    const res = await fetch("/api/tasks", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: task.id, ...body }),
    });
    return res.ok;
  }

  async function toggle() {
    setBusy("toggle");
    const ok = await send("PATCH", { status: done ? "accepted" : "done" });
    if (ok) router.refresh();
    else setBusy(null);
  }

  async function save() {
    if (title.trim().length < 2) return;
    setBusy("save");
    // Send rawDue only when changing it: a typed phrase re-resolves; "clear" wipes; otherwise untouched.
    const duePatch = clearDue ? { rawDue: "" } : rawDue.trim() ? { rawDue } : {};
    const ok = await send("PATCH", { title, notes, ...duePatch });
    if (ok) {
      setEditing(false);
      router.refresh();
    } else setBusy(null);
  }

  async function remove() {
    setBusy("delete");
    const ok = await send("DELETE", {});
    if (ok) router.refresh();
    else setBusy(null);
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-accent/40 bg-surface-2 p-3">
        <div className="space-y-2">
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title *" />
          <input
            className={input}
            value={rawDue}
            onChange={(e) => {
              setRawDue(e.target.value);
              if (e.target.value) setClearDue(false);
            }}
            placeholder={task.due_at ? `When — currently ${formatDate(task.due_at)} (leave blank to keep)` : "When (e.g. Friday 5pm) — optional"}
          />
          {task.due_at && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={clearDue} onChange={(e) => setClearDue(e.target.checked)} /> Clear the due date
            </label>
          )}
          <textarea
            className={`${input} min-h-[2.5rem] resize-y`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null || title.trim().length < 2}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setTitle(task.title);
              setRawDue("");
              setClearDue(false);
              setNotes(task.reasoning ?? "");
            }}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy !== null}
        title={done ? "Mark not done" : "Mark done"}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
          done ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400" : "border-border text-transparent hover:border-accent/60"
        }`}
      >
        {busy === "toggle" ? <Loader2 className="h-3 w-3 animate-spin text-muted" /> : <Check className="h-3.5 w-3.5" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {task.item_type && task.item_type !== "task" && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-strong">
              {(() => {
                const PillIcon = TYPE_PILL[task.item_type].icon;
                return <PillIcon className="h-2.5 w-2.5 text-accent" />;
              })()}
              {TYPE_PILL[task.item_type].label}
            </span>
          )}
          <p className={`truncate text-sm ${done ? "text-muted line-through" : "text-foreground"}`}>{task.title}</p>
        </div>
        {task.reasoning && <p className="truncate text-xs text-muted">{task.reasoning}</p>}
      </div>

      {task.due_at && <span className="shrink-0 text-xs text-muted">{formatDate(task.due_at)}</span>}

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy !== null}
          title="Edit"
          className="rounded-md p-1.5 text-muted hover:text-foreground disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy !== null}
          title="Delete"
          className="rounded-md p-1.5 text-muted hover:text-danger disabled:opacity-50"
        >
          {busy === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </li>
  );
}
