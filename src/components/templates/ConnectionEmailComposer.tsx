"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Inbox, Check, Copy, ExternalLink, ShieldCheck, Save, Lock, AlertTriangle } from "lucide-react";
import type { EmailTemplate, ConnectionType, ComposeResult } from "@/lib/templates/types";

/**
 * The connection-aware email composer. You pick a base template (a saved one or a Drive doc) and
 * describe a personal connection to a contact; Jarvis writes the concrete email AND proposes a
 * generalized, reusable template tied to the connection TYPE, with the personal specifics stripped.
 * Nothing is stored until you click save (autonomy L0).
 */
export function ConnectionEmailComposer({
  templates,
  connectionTypes,
}: {
  templates: EmailTemplate[];
  connectionTypes: ConnectionType[];
}) {
  const router = useRouter();
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [baseTemplateId, setBaseTemplateId] = useState("");
  const [driveRef, setDriveRef] = useState("");
  const [connectionTypeId, setConnectionTypeId] = useState("");
  const [connectionDetail, setConnectionDetail] = useState("");
  const [context, setContext] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ComposeResult | null>(null);

  // Editable copies of the model output (the user can tweak before saving, "maybe edit it").
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [genName, setGenName] = useState("");
  const [genSubject, setGenSubject] = useState("");
  const [genBody, setGenBody] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [typeDesc, setTypeDesc] = useState("");
  const [typeGuide, setTypeGuide] = useState("");

  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedUrl, setDraftSavedUrl] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function compose() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setDraftSavedUrl(null);
    setTemplateSaved(false);
    try {
      const res = await fetch("/api/templates/compose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactName,
          contactEmail: contactEmail || undefined,
          baseTemplateId: baseTemplateId || undefined,
          driveTemplateRef: baseTemplateId ? undefined : driveRef || undefined,
          connectionTypeId: connectionTypeId || undefined,
          connectionDetail,
          context: context || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data?.error ?? "Could not compose the email.");
        return;
      }
      const r = data as ComposeResult;
      setResult(r);
      setDraftSubject(r.draft.subject);
      setDraftBody(r.draft.body);
      setGenName(r.generalized.name);
      setGenSubject(r.generalized.subject);
      setGenBody(r.generalized.body);
      setTypeLabel(r.connectionType.label);
      setTypeDesc(r.connectionType.description);
      setTypeGuide(r.connectionType.guidance);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftToGmail() {
    setSavingDraft(true);
    setErr(null);
    try {
      const res = await fetch("/api/google/gmail/create-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: contactEmail ? `${contactName} <${contactEmail}>` : undefined,
          subject: draftSubject,
          body: draftBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Couldn't save the draft.");
      else setDraftSavedUrl(data.url ?? "https://mail.google.com/mail/u/0/#drafts");
    } catch {
      setErr("Network error saving the draft.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    setErr(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionType: { label: typeLabel, description: typeDesc, guidance: typeGuide },
          template: { name: genName, subject: genSubject, body: genBody, placeholders: result?.generalized.placeholders ?? [] },
        }),
      });
      const data = await res.json();
      if (!res.ok) setErr(data?.error ?? "Couldn't save the template.");
      else {
        setTemplateSaved(true);
        router.refresh();
      }
    } catch {
      setErr("Network error saving the template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard?.writeText(`Subject: ${draftSubject}\n\n${draftBody}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Couldn't copy to clipboard.");
    }
  }

  const composeUrl =
    contactEmail && result
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contactEmail)}&su=${encodeURIComponent(draftSubject)}&body=${encodeURIComponent(draftBody)}`
      : null;

  const field = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/50";

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">Compose with a connection</h2>
        <p className="mt-1 text-xs text-muted">
          Describe how you know this contact. Jarvis writes the email and saves a reusable template for
          this <em>kind</em> of connection, never the personal details.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name *" className={field} />
        <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Contact email (optional)" className={field} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Base template</span>
          <select value={baseTemplateId} onChange={(e) => setBaseTemplateId(e.target.value)} className={field}>
            <option value="">- None / write from scratch -</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.connectionTypeLabel ? ` · ${t.connectionTypeLabel}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Connection type</span>
          <select value={connectionTypeId} onChange={(e) => setConnectionTypeId(e.target.value)} className={field}>
            <option value="">- New / let Jarvis name it -</option>
            {connectionTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!baseTemplateId && (
        <input
          value={driveRef}
          onChange={(e) => setDriveRef(e.target.value)}
          placeholder="…or pull from a Google Drive doc (name or link, optional)"
          className={`${field} mt-3`}
        />
      )}

      <div className="mt-3">
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent">
          <Lock className="h-3.5 w-3.5" /> Private connection detail, used to write this email, never saved
        </label>
        <textarea
          value={connectionDetail}
          onChange={(e) => setConnectionDetail(e.target.value)}
          rows={2}
          placeholder="e.g. My dad worked with them at Acme in the 2000s and suggested I reach out."
          className={`${field} resize-y`}
        />
      </div>

      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        rows={2}
        placeholder="What's the email about? (the ask, intro, follow-up…), optional"
        className={`${field} mt-3 resize-y`}
      />

      <button
        type="button"
        onClick={compose}
        disabled={busy || contactName.trim().length < 2 || connectionDetail.trim().length < 3}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Draft email
      </button>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}

      {result && (
        <div className="mt-5 space-y-4">
          {/* Concrete draft */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Email to {contactName}</p>
            <input value={draftSubject} onChange={(e) => setDraftSubject(e.target.value)} className={`${field} font-semibold`} />
            <textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} rows={8} className={`${field} mt-2 resize-y`} />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {draftSavedUrl ? (
                <a href={draftSavedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/25">
                  <Check className="h-3.5 w-3.5" /> Saved to Gmail, open Drafts
                </a>
              ) : (
                <button type="button" onClick={saveDraftToGmail} disabled={savingDraft} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-50">
                  {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />} Save to Gmail Drafts
                </button>
              )}
              {composeUrl && (
                <a href={composeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" /> Open in Gmail
                </a>
              )}
              <button type="button" onClick={copyDraft} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Proposed reusable template */}
          <div className="rounded-xl border border-accent/30 bg-accent-soft/20 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Save className="h-4 w-4 text-accent" />
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Reusable template (no personal details)</p>
            </div>
            <p
              className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                result.privacyOk ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
              }`}
            >
              {result.privacyOk ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {result.privacyOk ? "Generalized for reuse, review the text before saving" : result.privacyNote ?? "A personal detail was removed"}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Connection type</span>
                <input value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} className={field} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Template name</span>
                <input value={genName} onChange={(e) => setGenName(e.target.value)} className={field} />
              </label>
            </div>

            <textarea value={typeDesc} onChange={(e) => setTypeDesc(e.target.value)} rows={2} placeholder="What kind of connection is this? (generalized)" className={`${field} mt-3 resize-y`} />
            <input value={genSubject} onChange={(e) => setGenSubject(e.target.value)} placeholder="Template subject" className={`${field} mt-3 font-semibold`} />
            <textarea value={genBody} onChange={(e) => setGenBody(e.target.value)} rows={7} className={`${field} mt-2 resize-y`} />

            {result.generalized.placeholders.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.generalized.placeholders.map((p) => (
                  <span key={p} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-strong">{`{{${p}}}`}</span>
                ))}
              </div>
            )}

            <div className="mt-3">
              {templateSaved ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Saved for next time
                </span>
              ) : (
                <button type="button" onClick={saveTemplate} disabled={savingTemplate || !typeLabel.trim() || !genBody.trim()} className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft/40 disabled:opacity-50">
                  {savingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save reusable template
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
