"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Upload, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DOC_TYPES, DOC_TYPE_LABEL, type DocType } from "@/lib/documents/types";

const MAX_FILE = 10 * 1024 * 1024; // 10 MB — plenty for a resume/portfolio PDF
const MAX_TEXT = 200_000;

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

// File types whose text we can read in the browser for an instant preview. PDF/DOCX are extracted
// server-side on save (see /api/documents/create), so they no longer need the paste box either.
const TEXT_LIKE = /\.(txt|md|markdown|json|csv|tex)$/i;

/**
 * Add a document the Application & Outreach Agent can use — upload a file (resume, grant material…) and
 * provide the text the agent should read. The file goes straight to the private 'documents' Storage
 * bucket (RLS-scoped to your own folder); only metadata + text reach our API.
 */
export function UploadDocumentForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState<{ name: string; docType: DocType; text: string; isDefault: boolean }>({
    name: "",
    docType: "resume",
    text: "",
    isDefault: false,
  });

  function reset() {
    setF({ name: "", docType: "resume", text: "", isDefault: false });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setErr(null);
    if (picked.size > MAX_FILE) {
      setErr(`That file is too large — keep it under ${Math.round(MAX_FILE / 1024 / 1024)} MB.`);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(picked);
    setF((p) => ({ ...p, name: p.name.trim() || picked.name.replace(/\.[^.]+$/, "") }));
    // Auto-read the text for text-like files so the agent has something to read without manual paste.
    if (TEXT_LIKE.test(picked.name)) {
      try {
        const text = await picked.text();
        if (text.trim()) setF((p) => ({ ...p, text: text.slice(0, MAX_TEXT) }));
      } catch {
        /* leave the paste box for the user */
      }
    }
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setErr("You're signed out. Refresh and sign in again.");
        return;
      }

      let storagePath: string | undefined;
      let mimeType: string | undefined;
      let fileSize: number | undefined;
      if (file) {
        const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
        const path = `${user.id}/${crypto.randomUUID()}${ext}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) {
          setErr(`Couldn't upload the file: ${upErr.message}`);
          return;
        }
        storagePath = path;
        mimeType = file.type || undefined;
        fileSize = file.size;
      }

      const res = await fetch("/api/documents/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          docType: f.docType,
          storagePath,
          mimeType,
          fileSize,
          extractedText: f.text,
          isDefault: f.isDefault,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? "Could not save the document.");
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setErr("Couldn't reach the server. Check your connection and try again.");
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
        <FilePlus2 className="h-4 w-4 text-accent" /> Add a document
      </button>
    );

  const canSave = f.name.trim().length > 0 && (file !== null || f.text.trim().length > 0);

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New document</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="rounded-md p-1 text-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <input className={input} placeholder="Name *" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
        <select
          className={input}
          value={f.docType}
          onChange={(e) => setF((p) => ({ ...p, docType: e.target.value as DocType }))}
        >
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <textarea
          className={`${input} min-h-[140px] resize-y`}
          placeholder={
            "Optional — attach a file and Jarvis reads it for you.\n" +
            "PDF, DOCX and text files are extracted automatically on upload; paste here only to add or override text."
          }
          value={f.text}
          onChange={(e) => setF((p) => ({ ...p, text: e.target.value.slice(0, MAX_TEXT) }))}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-strong hover:border-accent/50 hover:text-foreground"
        >
          <Upload className="h-3.5 w-3.5" /> {file ? "Change file" : "Attach a file"}
        </button>
        <input ref={fileRef} type="file" onChange={onFile} className="hidden" />
        {file && <span className="text-[11px] text-muted">{file.name}</span>}
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-strong">
          <input
            type="checkbox"
            checked={f.isDefault}
            onChange={(e) => setF((p) => ({ ...p, isDefault: e.target.checked }))}
          />
          Default for its type
        </label>
      </div>

      {err && <p className="mt-2 text-xs text-danger">{err}</p>}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !canSave}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save document
      </button>
    </div>
  );
}
