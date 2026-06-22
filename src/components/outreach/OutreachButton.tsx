"use client";

import { useState } from "react";
import { Send, Loader2, X, Copy, Check, Mail } from "lucide-react";
import { AUDIENCES, type Audience, type OutreachRunView } from "@/lib/agents/outreach/types";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

/**
 * Per-contact entry point to the Outreach agent. Pick an audience (the tone branch) + a goal; Grok
 * drafts a tailored email grounded in what the contact is working on. The draft is editable, then
 * saved into Gmail Drafts (never sent — hard rule #5).
 */
export function OutreachButton({ contactId, name }: { contactId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>("peer");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState<null | "draft" | "save">(null);
  const [err, setErr] = useState<string | null>(null);
  const [run, setRun] = useState<OutreachRunView | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  async function draft() {
    setBusy("draft");
    setErr(null);
    try {
      const res = await fetch("/api/outreach/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, audience, goal: goal.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as OutreachRunView & { error?: string };
      if (!res.ok) {
        setErr(data?.error ?? "Couldn't draft that email.");
        return;
      }
      setRun(data);
      setSubject(data.draftSubject ?? "");
      setBody(data.draftBody ?? "");
      setSaved(false);
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveToGmail() {
    if (!run) return;
    setBusy("save");
    setErr(null);
    try {
      const res = await fetch(`/api/outreach/${run.id}/gmail`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? "Couldn't save to Gmail.");
        return;
      }
      setSaved(true);
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function copy() {
    void navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function close() {
    setOpen(false);
    setRun(null);
    setErr(null);
    setGoal("");
    setSaved(false);
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-strong transition-colors hover:border-accent/50 hover:text-accent"
        title="Draft a tailored outreach email"
      >
        <Send className="h-3.5 w-3.5" /> Outreach
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Draft to {name.split(" ")[0]}</p>
            <button type="button" onClick={close} className="rounded-md p-1 text-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!run ? (
            <div className="space-y-2">
              <label className="block text-[11px] text-muted">Audience (sets the tone)</label>
              <select className={input} value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <textarea
                className={`${input} min-h-[68px] resize-y`}
                placeholder="What do you want from this email? (the ask)"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
              {err && <p className="text-xs text-danger">{err}</p>}
              <button
                type="button"
                onClick={() => void draft()}
                disabled={busy !== null}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
              >
                {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {busy === "draft" ? "Drafting…" : "Draft email"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
              <textarea
                className={`${input} min-h-[180px] resize-y`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Body"
              />
              {err && <p className="text-xs text-danger">{err}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveToGmail()}
                  disabled={busy !== null}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
                >
                  {busy === "save" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {saved ? "Saved to Gmail" : "Save to Gmail"}
                </button>
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-strong hover:text-foreground"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRun(null)}
                className="w-full text-center text-[11px] text-muted hover:text-foreground"
              >
                ← Start over
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
