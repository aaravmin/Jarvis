"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

/** Manual "add a task" form (collapsible). The due date is chrono-resolved server-side. */
export function ManualTaskForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ title: "", rawDue: "", notes: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Could not add.");
      else {
        setF({ title: "", rawDue: "", notes: "" });
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted-strong hover:border-accent/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4 text-accent" /> Add a task
      </button>
    );

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New task</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={`${input} sm:col-span-2`} placeholder="What needs doing? *" value={f.title} onChange={set("title")} />
        <input className={input} placeholder="Due (e.g. Friday, March 15)" value={f.rawDue} onChange={set("rawDue")} />
        <input className={input} placeholder="Notes" value={f.notes} onChange={set("notes")} />
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || f.title.trim().length < 2}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add task
      </button>
    </div>
  );
}
