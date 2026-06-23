"use client";

import { useState } from "react";
import { Trash2, FileText, Link2, Bot, User, Loader2 } from "lucide-react";
import type { EmailTemplate, ConnectionType } from "@/lib/templates/types";

/** Lists saved templates + connection types with delete. Optimistic removal, no full reload needed. */
export function TemplatesManager({
  templates,
  connectionTypes,
}: {
  templates: EmailTemplate[];
  connectionTypes: ConnectionType[];
}) {
  const [tpls, setTpls] = useState(templates);
  const [types, setTypes] = useState(connectionTypes);

  async function delTemplate(id: string) {
    const prev = tpls;
    setTpls((t) => t.filter((x) => x.id !== id));
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!res.ok) setTpls(prev);
  }

  async function delType(id: string) {
    const prev = types;
    setTypes((t) => t.filter((x) => x.id !== id));
    const res = await fetch(`/api/connection-types/${id}`, { method: "DELETE" });
    if (!res.ok) setTypes(prev);
  }

  if (tpls.length === 0 && types.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface-2 p-6 text-center text-sm text-muted">
        No saved templates yet. Compose an email with a connection above, Jarvis will offer to save a
        reusable template for that kind of connection.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {tpls.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Saved templates</h2>
          <div className="space-y-2">
            {tpls.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <FileText className="h-4 w-4 shrink-0 text-accent" /> {t.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <SourceBadge source={t.source} />
                      {t.connectionTypeLabel && (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="h-3 w-3" /> {t.connectionTypeLabel}
                        </span>
                      )}
                      {t.timesUsed > 0 && <span>· used {t.timesUsed}×</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void delTemplate(t.id)}
                    aria-label="Delete template"
                    className="shrink-0 rounded-lg border border-border p-1.5 text-muted transition-colors hover:border-danger/50 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {t.subject && <p className="mt-2 text-sm font-medium text-foreground">{t.subject}</p>}
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-strong">{t.body}</p>
                {t.placeholders.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.placeholders.map((p) => (
                      <span key={p} className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted-strong">{`{{${p}}}`}</span>
                    ))}
                  </div>
                )}
                <TemplateInstructions id={t.id} initial={t.instructions} />
              </div>
            ))}
          </div>
        </section>
      )}

      {types.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Connection types</h2>
          <div className="space-y-2">
            {types.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-2 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{c.label}</p>
                  {c.description && <p className="mt-0.5 text-xs text-muted">{c.description}</p>}
                  {c.guidance && <p className="mt-1 text-xs italic text-muted-strong">“{c.guidance}”</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void delType(c.id)}
                  aria-label="Delete connection type"
                  className="shrink-0 rounded-lg border border-border p-1.5 text-muted transition-colors hover:border-danger/50 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Per-template instructions editor: tells Jarvis how to fill this template (saved on the template). */
function TemplateInstructions({ id, initial }: { id: string; initial?: string }) {
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instructions: value }),
      });
      if (res.ok) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <label className="text-[11px] font-medium uppercase tracking-wide text-muted">Instructions for Jarvis</label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={'How should Jarvis fill this template? e.g. bracketed parts like [what they do] are instructions, research the person and fill them in.'}
        className="mt-1 min-h-[56px] w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || value === (initial ?? "")}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-accent/50 px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent-soft/40 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {saved ? "Saved" : "Save instructions"}
      </button>
    </div>
  );
}

function SourceBadge({ source }: { source: EmailTemplate["source"] }) {
  if (source === "jarvis") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft/40 px-1.5 py-0.5 text-accent">
        <Bot className="h-3 w-3" /> Jarvis
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-muted">
      <User className="h-3 w-3" /> {source === "drive" ? "Drive" : "You"}
    </span>
  );
}
