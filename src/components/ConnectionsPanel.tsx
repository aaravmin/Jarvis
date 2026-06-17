"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plug, CheckCircle2, AlertTriangle, Users, FileText, Copy, ExternalLink } from "lucide-react";
import type { GoogleConnection } from "@/lib/google/store";

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
          Connect Google (read-only) so the Contact and Email agents can use your Drive and Sheets.
        </p>
      </header>

      <StatusBanner status={status} />

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
            <form action="/api/connect/google/disconnect" method="post">
              <button
                type="submit"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-danger/50 hover:text-danger"
              >
                Disconnect
              </button>
            </form>
          ) : (
            <a
              href="/api/connect/google"
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] transition-colors hover:bg-accent-strong"
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
          Once connected, you&apos;ll be able to import contacts from a Google Sheet and draft emails from a
          Drive template here.
        </p>
      )}
    </div>
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
        setMsg(`Imported ${data.resultCount} contact${data.resultCount === 1 ? "" : "s"} from “${data.sheetTitle}” — review them now.`);
        setTimeout(() => router.push("/review"), 900);
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#04181f] transition-colors hover:bg-accent-strong disabled:opacity-50"
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

  async function run() {
    setBusy(true);
    setErr(null);
    setDraft(null);
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

  async function copyDraft() {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Draft an email from a Drive template</h2>
      </div>
      <p className="mb-3 text-xs text-muted">
        Name a Google Doc template (or paste its link). Jarvis fills its placeholders from your context
        and drafts the email — draft only, nothing is sent.
      </p>
      <div className="space-y-2">
        <input
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          disabled={busy}
          placeholder="Template name or Drive link — e.g. “Outreach template”"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={busy}
          placeholder="Recipient (optional) — e.g. “Dr. Jane Smith, Brown alum at Acme”"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="Context to fill the template (optional) — what to mention, why you're reaching out…"
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || template.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#04181f] transition-colors hover:bg-accent-strong disabled:opacity-50"
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
        </div>
      )}
    </section>
  );
}
