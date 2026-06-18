"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Upload, Loader2, X } from "lucide-react";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

/**
 * "Add your own template" — type one or upload a .txt/.md file. Saves to the user's templates
 * (source "user") so Jarvis can reuse and adapt it. Verbatim: no scrubbing, the user authored it.
 */
export function NewTemplateForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", subject: "", body: "" });
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const text = await file.text();
      setF((p) => ({
        ...p,
        body: text,
        // Default the name to the filename (minus extension) if the user hasn't named it yet.
        name: p.name.trim() || file.name.replace(/\.[^.]+$/, ""),
      }));
    } catch {
      setErr("Couldn't read that file. Try a .txt or .md file.");
    } finally {
      if (fileRef.current) fileRef.current.value = ""; // allow re-selecting the same file
    }
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/templates/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Could not save the template.");
      else {
        setF({ name: "", subject: "", body: "" });
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
        <FilePlus2 className="h-4 w-4 text-accent" /> Add your own template
      </button>
    );

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New template</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2">
        <input className={input} placeholder="Template name *" value={f.name} onChange={set("name")} />
        <input className={input} placeholder="Subject (optional)" value={f.subject} onChange={set("subject")} />
        <textarea
          className={`${input} min-h-[160px] resize-y font-mono`}
          placeholder={"Template body. Use {{placeholders}} for the parts Jarvis should fill in,\ne.g. Hi {{first name}}, …"}
          value={f.body}
          onChange={set("body")}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-strong hover:border-accent/50 hover:text-foreground"
        >
          <Upload className="h-3.5 w-3.5" /> Upload .txt / .md
        </button>
        <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" onChange={onFile} className="hidden" />
        <span className="text-[11px] text-muted">or paste the text above</span>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || f.name.trim().length < 1 || f.body.trim().length < 1}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save template
      </button>
    </div>
  );
}
