"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, X } from "lucide-react";
import { FindEmailButton } from "@/components/FindEmailButton";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

/** Manual "add a contact" form (collapsible) for the People page. When Apollo is configured, a
 *  "Find email" button looks up the work email from the name + company and prefills it. */
export function ManualContactForm({ apolloEnabled = false }: { apolloEnabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ fullName: "", company: "", roleTitle: "", email: "", linkedin: "", notes: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/contacts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Could not add.");
      else {
        setF({ fullName: "", company: "", roleTitle: "", email: "", linkedin: "", notes: "" });
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
        <UserPlus className="h-4 w-4 text-accent" /> Add a contact
      </button>
    );

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New contact</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={input} placeholder="Full name *" value={f.fullName} onChange={set("fullName")} />
        <input className={input} placeholder="Company" value={f.company} onChange={set("company")} />
        <input className={input} placeholder="Role / title" value={f.roleTitle} onChange={set("roleTitle")} />
        <input className={input} placeholder="Email" value={f.email} onChange={set("email")} />
        <input className={input} placeholder="LinkedIn URL" value={f.linkedin} onChange={set("linkedin")} />
        <input className={input} placeholder="Notes" value={f.notes} onChange={set("notes")} />
      </div>
      {apolloEnabled && (
        <div className="mt-2">
          <FindEmailButton
            fullName={f.fullName}
            company={f.company || undefined}
            linkedin={f.linkedin || undefined}
            onFound={(email) => setF((p) => ({ ...p, email }))}
          />
        </div>
      )}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || f.fullName.trim().length < 2}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add contact
      </button>
    </div>
  );
}
