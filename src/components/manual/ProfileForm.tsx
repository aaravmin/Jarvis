"use client";

import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Compact "about you" editor. This profile (who you are / role / what you're building toward) is fed
 * to the email triage so GOTT judges importance relative to YOUR work, not someone else's.
 * Collapsed by default.
 */
export function ProfileForm({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const [open, setOpen] = useState(defaultOpen);
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
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Edit your profile
      </button>
    );

  return (
    <div className="rounded-md border bg-card p-3">
      <p className="mb-2 text-sm font-medium text-foreground">About you</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input className="sm:col-span-2" placeholder="Headline, e.g. Runs an AI x social-impact consortium at Brown" value={f.headline} onChange={set("headline")} />
        <Input placeholder="Age (optional)" value={f.age} onChange={set("age")} inputMode="numeric" />
        <Input placeholder="Role, e.g. founder / organizer" value={f.level} onChange={set("level")} />
        <Input className="sm:col-span-2" placeholder="What you're building toward, e.g. recruiting criminal-justice-reform members and speakers" value={f.lookingFor} onChange={set("lookingFor")} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : saved ? <Check /> : null}
          {saved ? "Saved" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-muted-foreground">
          Close
        </Button>
      </div>
    </div>
  );
}
