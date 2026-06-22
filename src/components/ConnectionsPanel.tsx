"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plug,
  CheckCircle2,
  AlertTriangle,
  Users,
  FileText,
  Copy,
  ExternalLink,
  Inbox,
  RefreshCw,
  Check,
} from "lucide-react";
import type { GoogleConnection } from "@/lib/google/store";
import { SiteLoginsTool } from "@/components/connections/SiteLoginsTool";

/** Write scopes that light up the draft/calendar/export features once re-granted. */
const WRITE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
];

function StatusBanner({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "connected")
    return (
      <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" /> Google connected.
      </p>
    );
  if (status === "disconnected")
    return <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">Google disconnected.</p>;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      <AlertTriangle className="h-4 w-4" /> Couldn&apos;t connect Google ({status.replace(/^error:/, "")}). Try again.
    </p>
  );
}

export function ConnectionsPanel({
  connection,
  status,
}: {
  connection: GoogleConnection | null;
  status?: string;
}) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold text-foreground">Connections</h1>
        <p className="mt-1 text-sm text-muted">
          Connect Google so Jarvis can read your Gmail, Calendar, Drive &amp; Sheets, and now save
          email drafts and export your contacts. After an update, click Reconnect to grant the new
          permissions.
        </p>
      </header>

      <StatusBanner status={status} />
      {connection && <WriteScopeNotice scopes={connection.scopes} />}

      <section className="rounded-xl border border-border bg-surface-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface">
              <Plug className="h-4 w-4 text-accent" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">Google</p>
              <p className="text-xs text-muted">
                {connection ? `Connected${connection.email ? ` · ${connection.email}` : ""}` : "Not connected"}
              </p>
            </div>
          </div>
          {connection ? (
            <div className="flex items-center gap-2">
              <a
                href="/api/connect/google"
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft/40"
                title="Re-run consent to grant any newly added permissions"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reconnect
              </a>
              <form action="/api/connect/google/disconnect" method="post">
                <button
                  type="submit"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger/50 hover:text-danger"
                >
                  Disconnect
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/api/connect/google"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              Connect Google
            </a>
          )}
        </div>
        {connection?.scopes?.length ? (
          <p className="mt-3 text-[11px] text-muted">
            Scopes: {connection.scopes.map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(", ")}
          </p>
        ) : null}
      </section>

      {connection ? (
        <>
          <ImportContactsTool />
          <DraftEmailTool />
        </>
      ) : (
        <p className="text-sm text-muted">
          Once connected, you&apos;ll be able to import contacts from a Google Sheet and draft emails from
          a Drive template (and save them to Gmail) here.
        </p>
      )}

      <SiteLoginsTool />
    </div>
  );
}

/** Nudge the user to reconnect when their grant predates the write scopes. */
function WriteScopeNotice({ scopes }: { scopes: string[] }) {
  const granted = new Set(scopes);
  const missing = WRITE_SCOPES.filter((s) => !granted.has(s));
  if (missing.length === 0) return null;
  return (
    <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      Write features (save email drafts, let the assistant add calendar events, and export contacts) need new permissions.{" "}
      <a href="/api/connect/google" className="font-semibold underline">
        Reconnect Google
      </a>{" "}
      to enable them.
    </p>
  );
}

function ImportContactsTool() {
  const router = useRouter();
  const [sheet, setSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/google/import-contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sheet }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Import failed.");
      else {
        const n = data.resultCount as number;
        setMsg(`Imported ${n} contact${n === 1 ? "" : "s"} from “${data.sheetTitle}”. Filling in missing info and validating…`);
        // Second pass: validate the existing contact info + fill the blanks BEFORE sending the user to
        // Review, so the cards they review already carry verified/mismatch badges and any filled fields.
        if (n > 0 && data.runId) {
          try {
            const vr = await fetch("/api/contacts/validate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ researchRunId: data.runId }),
            });
            const vd = await vr.json().catch(() => null);
            setMsg(`Imported ${n} from “${data.sheetTitle}”. ${vd?.message ?? ""} Review them now.`.replace(/\s+/g, " ").trim());
          } catch {
            setMsg(`Imported ${n} contact${n === 1 ? "" : "s"} from “${data.sheetTitle}”, review them now.`);
          }
        }
        setTimeout(() => router.push("/review"), 1100);
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Import contacts from a Google Sheet</h2>
      </div>
      <p className="mb-3 text-xs text-muted">
        Paste a Sheets link (e.g. your alumni database). Each row becomes a suggested contact in Review,
        with the sheet + the row as its source. Nothing is added until you accept it.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={sheet}
          onChange={(e) => setSheet(e.target.value)}
          disabled={busy}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || sheet.trim().length < 8}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Import
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-success">{msg}</p>}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </section>
  );
}

function DraftEmailTool() {
  const [template, setTemplate] = useState("");
  const [to, setTo] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ subject: string; body: string; templateName: string; templateUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    setDraft(null);
    setSavedUrl(null);
    try {
      const res = await fetch("/api/google/draft-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template, to, context }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Draft failed.");
      else setDraft(data);
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
        body: JSON.stringify({ to: to.trim() || undefined, subject: draft.subject, body: draft.body }),
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

  async function copyDraft() {
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
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Draft an email from a Drive template</h2>
      </div>
      <p className="mb-3 text-xs text-muted">
        Name a Google Doc template (or paste its link). Jarvis fills its placeholders from your context
        and drafts the email, draft only, nothing is sent.
      </p>
      <div className="space-y-2">
        <input
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          disabled={busy}
          placeholder="Template name or Drive link, e.g. “Outreach template”"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={busy}
          placeholder="Recipient (optional), e.g. “Dr. Jane Smith, engineer at Acme”"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="Context to fill the template (optional), what to mention, why you're reaching out…"
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || template.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Draft email
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      {draft && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              From template:{" "}
              {draft.templateUrl ? (
                <a href={draft.templateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                  {draft.templateName} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                draft.templateName
              )}
            </p>
            <button
              type="button"
              onClick={copyDraft}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted transition-colors hover:text-foreground"
            >
              <Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-sm font-semibold text-foreground">{draft.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-strong">{draft.body}</p>
          <div className="mt-2.5">
            {savedUrl ? (
              <a
                href={savedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/25"
              >
                <Check className="h-3.5 w-3.5" /> Saved to Gmail, open Drafts
              </a>
            ) : (
              <button
                type="button"
                onClick={saveToGmail}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />}
                Save to Gmail Drafts
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
