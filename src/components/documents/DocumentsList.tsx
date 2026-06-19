"use client";

import { useState } from "react";
import { FileText, Star, Trash2, Loader2, Paperclip } from "lucide-react";
import type { AppDocument } from "@/lib/documents/types";
import { DOC_TYPE_LABEL } from "@/lib/documents/types";

function sizeLabel(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Lists the user's documents (the agent's materials). Each shows its type, whether it has an attached
 * file vs. text only, and a "Use by default" toggle. Optimistic delete; reverts on error.
 */
export function DocumentsList({ documents }: { documents: AppDocument[] }) {
  const [docs, setDocs] = useState(documents);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    const prev = docs;
    setDocs((d) => d.filter((x) => x.id !== id));
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) setDocs(prev); // revert on failure
  }

  async function makeDefault(id: string) {
    setBusyId(id);
    const target = docs.find((d) => d.id === id);
    const prev = docs;
    // Optimistic: this becomes default, clearing the flag on others of the same type.
    setDocs((d) =>
      d.map((x) =>
        x.docType === target?.docType ? { ...x, isDefault: x.id === id } : x,
      ),
    );
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ setDefault: true }),
    });
    if (!res.ok) setDocs(prev);
    setBusyId(null);
  }

  if (docs.length === 0) return null;

  return (
    <div className="space-y-2">
      {docs.map((d) => {
        const size = sizeLabel(d.fileSize);
        return (
          <div key={d.id} className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-accent" />
                  <span className="truncate text-sm font-medium text-foreground">{d.name}</span>
                  {d.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft/40 px-2 py-0.5 text-[11px] font-medium text-accent">
                      <Star className="h-3 w-3" /> Default
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{DOC_TYPE_LABEL[d.docType]}</span>
                  {d.storagePath ? (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> File attached{size ? ` · ${size}` : ""}
                    </span>
                  ) : (
                    <span>Text only</span>
                  )}
                  {(d.extractedText?.trim().length ?? 0) > 0 && (
                    <span>{d.extractedText!.trim().length.toLocaleString()} chars of text</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!d.isDefault && (
                  <button
                    type="button"
                    onClick={() => void makeDefault(d.id)}
                    disabled={busyId === d.id}
                    title="Use this by default for its type"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-strong hover:border-accent/50 hover:text-foreground disabled:opacity-50"
                  >
                    {busyId === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                    Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove(d.id)}
                  title="Delete document"
                  className="rounded-md p-1.5 text-muted hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
