"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Manual "add a task" form (collapsible), the sheet's add-row bar. The due date is chrono-resolved
 *  server-side. */
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
        className="flex w-full items-center gap-1.5 border-b px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
      >
        <Plus className="size-3.5" /> Add a task
      </button>
    );

  return (
    <div className="border-b bg-secondary/30 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-2 sm:grid-cols-3"
      >
        <Input autoFocus placeholder="What needs doing? *" value={f.title} onChange={set("title")} className="sm:col-span-3" />
        <Input placeholder="Due (e.g. Friday, March 15)" value={f.rawDue} onChange={set("rawDue")} />
        <Input placeholder="Notes" value={f.notes} onChange={set("notes")} className="sm:col-span-2" />
      </form>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={busy || f.title.trim().length < 2}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} Add task
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          <X /> Cancel
        </Button>
      </div>
    </div>
  );
}
