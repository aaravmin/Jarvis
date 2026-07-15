"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export type Task = {
  id: string;
  title: string;
  due_at: string | null;
  reasoning: string | null;
  status: string;
  item_type?: "task" | "event" | "follow_up";
};

// Events and follow-ups share this list with plain tasks; a quiet text tag keeps them distinct. Tasks
// get no tag to avoid clutter (they're the default).
const TYPE_LABEL: Record<"event" | "follow_up", string> = { event: "Event", follow_up: "Follow-up" };

/**
 * One task row of the Tasks sheet: check it off (toggles items.status done⇄accepted), edit its
 * title/notes/due, or delete it. The due date is always re-resolved server-side by chrono (hard rule
 * #2), this component only sends the raw phrase. Renders as a <TableRow>; editing swaps it for a
 * single full-width form row so the sheet layout never breaks.
 */
export function TaskItem({ task }: { task: Task }) {
  const router = useRouter();
  const done = task.status === "done";
  // Display-only comparison against the already-resolved due_at (no date maths on the model, hard
  // rule #2; this just colors an existing timestamp for the reader).
  const overdue = !done && Boolean(task.due_at) && new Date(task.due_at as string).getTime() < Date.now();
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
    if (!window.confirm("Delete this item? This can't be undone.")) return;
    setBusy("delete");
    const ok = await send("DELETE", {});
    if (ok) router.refresh();
    else setBusy(null);
  }

  if (editing) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={4} className="max-w-0 whitespace-normal bg-secondary/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input className="sm:col-span-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title *" />
            <Input
              value={rawDue}
              onChange={(e) => {
                setRawDue(e.target.value);
                if (e.target.value) setClearDue(false);
              }}
              placeholder={task.due_at ? `When, currently ${formatDate(task.due_at)} (leave blank to keep)` : "When (e.g. Friday 5pm), optional"}
            />
            <Textarea
              className="min-h-[2.5rem] sm:col-span-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
            />
          </div>
          {task.due_at && (
            <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={clearDue} onCheckedChange={(v) => setClearDue(v === true)} /> Clear the due date
            </label>
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy !== null || title.trim().length < 2}>
              {busy === "save" ? <Loader2 className="animate-spin" /> : <Check />} Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setEditing(false);
                setTitle(task.title);
                setRawDue("");
                setClearDue(false);
                setNotes(task.reasoning ?? "");
              }}
            >
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy !== null}
          title={done ? "Mark not done" : "Mark done"}
          className={`flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50 ${
            done ? "border-success/50 bg-success/15 text-success" : "border-input text-transparent hover:border-primary/60"
          }`}
        >
          {busy === "toggle" ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : <Check className="size-3" />}
        </button>
      </TableCell>

      <TableCell className="max-w-0 w-full whitespace-normal">
        <div className="flex items-center gap-1.5">
          {task.item_type && task.item_type !== "task" && (
            <span className="inline-flex shrink-0 items-center rounded border border-border px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {TYPE_LABEL[task.item_type]}
            </span>
          )}
          <p className={`truncate text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</p>
        </div>
        {task.reasoning && <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.reasoning}</p>}
      </TableCell>

      <TableCell>
        {task.due_at && (
          <span className={`text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
            {formatDate(task.due_at)}
          </span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" size="icon-xs" title="Edit" disabled={busy !== null} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Delete"
            disabled={busy !== null}
            onClick={() => void remove()}
            className="text-muted-foreground hover:text-destructive"
          >
            {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
