"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  CheckCircle2,
  Trash2,
  Loader2,
  Save,
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  Wand2,
} from "lucide-react";
import type { ApplicationRunView, FieldPlanItem, FieldValueSource } from "@/lib/agents/application/types";

const SOURCE_LABEL: Record<FieldValueSource, string> = {
  resume: "Resume",
  profile: "Profile",
  document: "Document",
  opportunity: "Opportunity",
  inferred: "Inferred",
  user: "You",
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const STATUS: Record<ApplicationRunView["status"], { label: string; cls: string }> = {
  running: { label: "Preparing…", cls: "border-border text-muted" },
  needs_review: { label: "Needs review", cls: "border-accent/40 bg-accent-soft/40 text-accent" },
  submitted: { label: "Submitted", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  error: { label: "Error", cls: "border-danger/40 bg-danger/10 text-danger" },
};

/**
 * One prepared application. Shows the grounded field_plan (each field with its value, provenance, and
 * whether it still needs the user), editable before submitting. The agent never submits — the user
 * opens the link, submits, then marks it submitted here (hard rule #5).
 */
export function ApplicationRunCard({ run }: { run: ApplicationRunView }) {
  const router = useRouter();
  const [plan, setPlan] = useState<FieldPlanItem[]>(run.fieldPlan);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "submit" | "delete" | "autofill">(null);
  const [fill, setFill] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);

  const grounded = plan.filter((f) => f.filled && f.value.trim().length > 0).length;

  const status = STATUS[run.status];
  const heading = run.title || run.organization || hostOf(run.targetUrl);

  function editValue(i: number, value: string) {
    setPlan((p) => p.map((f, idx) => (idx === i ? { ...f, value, filled: value.trim().length > 0 } : f)));
    setDirty(true);
  }

  async function save() {
    setBusy("save");
    const res = await fetch(`/api/applications/${run.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fieldPlan: plan }),
    });
    setBusy(null);
    if (res.ok) {
      setDirty(false);
      router.refresh();
    }
  }

  async function markSubmitted() {
    setBusy("submit");
    const res = await fetch(`/api/applications/${run.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "submitted" }),
    });
    setBusy(null);
    if (res.ok) router.refresh();
  }

  async function autofill() {
    setBusy("autofill");
    setFill(null);
    try {
      const res = await fetch(`/api/applications/${run.id}/autofill`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; unavailable?: boolean }
        | null;
      setFill({
        tone: data?.ok ? "ok" : "warn",
        message: data?.message ?? "Autofill didn't return a result. Open the application and copy from the plan.",
      });
    } catch {
      setFill({ tone: "warn", message: "Couldn't reach the autofill service. Open the application and copy from the plan." });
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    setBusy("delete");
    const res = await fetch(`/api/applications/${run.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setBusy(null);
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{heading}</h3>
          <p className="mt-0.5 truncate text-xs text-muted">{hostOf(run.targetUrl)}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>
          {status.label}
        </span>
      </div>

      {run.summary && <p className="mt-2 text-xs leading-relaxed text-muted-strong">{run.summary}</p>}
      {run.error && <p className="mt-2 text-xs text-danger">{run.error}</p>}

      {run.unfilledCount > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          {run.unfilledCount} required field{run.unfilledCount === 1 ? "" : "s"} need you before submitting.
        </p>
      )}

      {plan.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {plan.map((f, i) => (
            <li key={`${f.label}-${i}`} className="grid grid-cols-[1fr] gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  {f.label}
                  {f.required && <span className="ml-1 text-danger">*</span>}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
                  {f.filled ? (
                    <CircleCheck className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <CircleDashed className="h-3 w-3" />
                  )}
                  {SOURCE_LABEL[f.source]}
                  {f.filled && f.confidence > 0 && ` · ${Math.round(f.confidence * 100)}%`}
                </span>
              </div>
              <textarea
                className="min-h-[2.25rem] w-full resize-y rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted"
                rows={f.value.length > 80 ? 3 : 1}
                value={f.value}
                placeholder={f.required ? "Required — add a value" : "Optional"}
                onChange={(e) => editValue(i, e.target.value)}
              />
              {f.filled && f.source_quote && (
                <p className="text-[10px] italic text-muted" title={f.source_quote}>
                  From: “{f.source_quote.slice(0, 120)}{f.source_quote.length > 120 ? "…" : ""}”
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={run.targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft/30 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft/50"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open application
        </a>
        {run.status !== "submitted" && grounded > 0 && (
          <button
            type="button"
            onClick={() => void autofill()}
            disabled={busy !== null}
            title="Open a real browser and type the grounded values into the live form. Jarvis never submits — you review and submit."
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft/30 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-soft/50 disabled:opacity-50"
          >
            {busy === "autofill" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Fill in browser
          </button>
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save edits
          </button>
        )}
        {run.status !== "submitted" && (
          <button
            type="button"
            onClick={() => void markSubmitted()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-strong hover:text-foreground disabled:opacity-50"
          >
            {busy === "submit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Mark submitted
          </button>
        )}
        <button
          type="button"
          onClick={() => void discard()}
          disabled={busy !== null}
          title="Discard"
          className="ml-auto rounded-md p-1.5 text-muted hover:text-danger disabled:opacity-50"
        >
          {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      {fill && (
        <p
          className={`mt-2 text-xs leading-relaxed ${fill.tone === "ok" ? "text-emerald-400" : "text-amber-400"}`}
        >
          {fill.message}
        </p>
      )}
    </div>
  );
}
