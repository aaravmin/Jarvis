"use client";

import { useEffect, useState } from "react";
import { UserCog, Loader2, Check } from "lucide-react";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

/**
 * Compact "about you" editor. This profile (age / level / what you're after) is fed to the
 * auto-population agents so they surface things relevant to you (e.g. internships for a freshman,
 * not senior roles). Collapsed by default.
 */
export function ProfileForm() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState({ headline: "", age: "", level: "", lookingFor: "" });

  useEffect(() => {
    if (!open) return;
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : { profile: {} }))
      .then((d) => {
        const p = d.profile ?? {};
        setF({ headline: p.headline ?? "", age: p.age != null ? String(p.age) : "", level: p.level ?? "", lookingFor: p.lookingFor ?? "" });
      })
      .catch(() => {});
  }, [open]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
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
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
      >
        <UserCog className="h-3.5 w-3.5" /> Edit your profile (makes suggestions relevant)
      </button>
    );

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <UserCog className="h-4 w-4 text-accent" /> About you
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={`${input} sm:col-span-2`} placeholder="Headline — e.g. CS freshman at Brown, into tech" value={f.headline} onChange={set("headline")} />
        <input className={input} placeholder="Age" value={f.age} onChange={set("age")} inputMode="numeric" />
        <input className={input} placeholder="Level — e.g. freshman / undergrad" value={f.level} onChange={set("level")} />
        <input className={`${input} sm:col-span-2`} placeholder="Looking for — e.g. summer internships, startups hiring interns, programs open to undergrads" value={f.lookingFor} onChange={set("lookingFor")} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? "Saved" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-foreground">
          Close
        </button>
      </div>
    </div>
  );
}
