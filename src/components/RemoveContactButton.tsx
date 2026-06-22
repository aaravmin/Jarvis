"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

/**
 * Remove a contact (and its channels). User-driven and irreversible, so it confirms first. RLS scopes
 * the DELETE to the signed-in user's own rows, it can only ever delete the caller's contacts. On
 * success the People page (a server component) re-fetches via router.refresh().
 */
export function RemoveContactButton({ contactId, name }: { contactId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    if (!window.confirm(`Remove ${name}? This can't be undone.`)) return;
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/contacts?id=${encodeURIComponent(contactId)}`, { method: "DELETE" });
      if (!res.ok) {
        setFailed(true);
        setPending(false);
        return;
      }
      router.refresh(); // row disappears on the next server render; this component unmounts with it
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void remove()}
      disabled={pending}
      aria-label={`Remove ${name}`}
      title={failed ? "Couldn't remove, try again" : "Remove contact"}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
        failed
          ? "border-danger/50 text-danger"
          : "border-border text-muted hover:border-danger/50 hover:text-danger"
      }`}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Remove
    </button>
  );
}
