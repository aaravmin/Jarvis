"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

const CATEGORIES = ["program", "job", "internship", "hackathon", "fellowship", "grant", "scholarship", "competition", "accelerator", "other"];

/** Manual "add an opportunity" form with rich fields (deadline, requirements, skills, comp, …). */
export function ManualOpportunityForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    title: "", organization: "", category: "other", rawDeadline: "", location: "",
    requiredSkills: "", compOrPrize: "", howToApplyUrl: "", rawEventDates: "", requirements: "", description: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/opportunities/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Could not add.");
      else {
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
        <Plus className="h-4 w-4 text-accent" /> Add manually
      </button>
    );

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New opportunity</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Title *" value={f.title} onChange={set("title")} />
        <input className={input} placeholder="Organization" value={f.organization} onChange={set("organization")} />
        <select className={input} value={f.category} onChange={set("category")}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <input className={input} placeholder="Deadline (e.g. March 15, 2026)" value={f.rawDeadline} onChange={set("rawDeadline")} />
        <input className={input} placeholder="Location (or Remote)" value={f.location} onChange={set("location")} />
        <input className={input} placeholder="Event dates (e.g. Feb 7-9)" value={f.rawEventDates} onChange={set("rawEventDates")} />
        <input className={input} placeholder="Required skills (comma-separated)" value={f.requiredSkills} onChange={set("requiredSkills")} />
        <input className={input} placeholder="Comp / prize / stipend" value={f.compOrPrize} onChange={set("compOrPrize")} />
        <input className={`${input} sm:col-span-2`} placeholder="How to apply (URL)" value={f.howToApplyUrl} onChange={set("howToApplyUrl")} />
        <input className={`${input} sm:col-span-2`} placeholder="Requirements / eligibility" value={f.requirements} onChange={set("requirements")} />
        <textarea className={`${input} sm:col-span-2`} rows={2} placeholder="Description" value={f.description} onChange={set("description")} />
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || f.title.trim().length < 2}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add opportunity
      </button>
    </div>
  );
}
