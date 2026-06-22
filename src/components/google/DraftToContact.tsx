"use client";

import { useEffect, useRef, useState } from "react";
import { PenLine, Loader2, Copy, ExternalLink, Check, Inbox } from "lucide-react";

/**
 * Compose an email to a contact: Jarvis drafts it (optionally from a Drive template) given your
 * context, then you open it prefilled in Gmail's compose window (no send scope needed).
 */
export function DraftToContact({ name, email }: { name: string; email?: string }) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function generate() {
    setBusy(true);
    setErr(null);
    setDraft(null);
    try {
      const res = await fetch("/api/google/draft-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template, to: email ? `${name} <${email}>` : name, context }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Draft failed.");
      else {
        setDraft({ subject: data.subject, body: data.body });
        setSavedUrl(null);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function saveToGmail() {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/google/gmail/create-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: email ? `${name} <${email}>` : undefined,
          subject: draft.subject,
          body: draft.body,
        }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Couldn't save the draft.");
      else setSavedUrl(data.url ?? "https://mail.google.com/mail/u/0/#drafts");
    } catch {
      setErr("Network error saving the draft.");
    } finally {
      setSaving(false);
    }
  }

  const composeUrl =
    draft && email
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`
      : null;

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard?.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Couldn't copy to clipboard.");
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-foreground"
        title="Draft an email"
      >
        <PenLine className="h-3.5 w-3.5" /> Draft
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 rounded-xl border border-border-strong bg-surface p-3 shadow-2xl">
          <p className="mb-2 text-xs text-muted">To: {name}{email ? ` <${email}>` : ""}</p>
          <input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Drive template name (optional)"
            className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
          />
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={3}
            placeholder="What's this about? (e.g. intro, asking for a referral, following up…)"
            className="w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || (!template.trim() && context.trim().length < 3)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Draft
          </button>
          {err && <p className="mt-2 text-xs text-danger">{err}</p>}

          {draft && (
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2.5">
              <p className="text-sm font-semibold text-foreground">{draft.subject}</p>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-strong">{draft.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {savedUrl ? (
                  <a
                    href={savedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-success/15 px-2.5 py-1 text-xs font-medium text-success hover:bg-success/25"
                  >
                    <Check className="h-3.5 w-3.5" /> Saved, open Drafts
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => void saveToGmail()}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />} Save to Gmail Drafts
                  </button>
                )}
                {composeUrl && (
                  <a
                    href={composeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open in Gmail
                  </a>
                )}
                <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
