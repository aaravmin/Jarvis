"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Loader2, X } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

export type EditableContact = {
  fullName: string;
  company: string;
  roleTitle: string;
  email: string;
  linkedin: string;
  notes: string;
};

/**
 * Edit an existing contact. A small button opens a modal pre-filled with the current values; saving
 * PATCHes /api/contacts. RLS scopes the write to the caller's own row. On success the People page (a
 * server component) re-fetches via router.refresh().
 */
export function EditContactForm({
  contactId,
  initial,
}: {
  contactId: string;
  initial: EditableContact;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EditableContact>(initial);

  const field = (key: keyof EditableContact) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  function start() {
    setForm(initial); // re-sync to the latest server values each time it opens
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (form.fullName.trim().length < 2) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: contactId, ...form }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't save changes.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={`Edit ${initial.fullName}`}
        title="Edit contact"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !busy && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Edit ${initial.fullName}`}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface-2 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Edit contact</h3>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1 text-muted transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <input
                value={form.fullName}
                onChange={field("fullName")}
                placeholder="Full name"
                aria-label="Full name"
                className={inputCls}
              />
              <input
                value={form.company}
                onChange={field("company")}
                placeholder="Company"
                aria-label="Company"
                className={inputCls}
              />
              <input
                value={form.roleTitle}
                onChange={field("roleTitle")}
                placeholder="Role / title"
                aria-label="Role or title"
                className={inputCls}
              />
              <input
                value={form.email}
                onChange={field("email")}
                placeholder="Email"
                aria-label="Email"
                type="email"
                className={inputCls}
              />
              <input
                value={form.linkedin}
                onChange={field("linkedin")}
                placeholder="LinkedIn URL"
                aria-label="LinkedIn URL"
                className={inputCls}
              />
              <textarea
                value={form.notes}
                onChange={field("notes")}
                placeholder="Notes"
                aria-label="Notes"
                rows={3}
                className={inputCls}
              />
            </div>

            {error && <p className="mt-2 text-xs text-danger">{error}</p>}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
