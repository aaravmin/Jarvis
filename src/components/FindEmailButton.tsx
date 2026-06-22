"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2 } from "lucide-react";

/**
 * "Find email" via Apollo.io. Two modes:
 *   • Enrich an existing contact, pass contactId; the found address is saved server-side (with Apollo
 *     recorded as the source) and the page refreshes.
 *   • Prefill a form, pass onFound; the address is handed back, nothing is persisted yet.
 * Only rendered when Apollo is configured (the People page gates on apolloEnabled()).
 */
export function FindEmailButton({
  contactId,
  fullName,
  company,
  linkedin,
  onFound,
}: {
  contactId?: string;
  fullName: string;
  company?: string;
  linkedin?: string;
  onFound?: (email: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function find() {
    if (fullName.trim().length < 2 && !linkedin) {
      setMsg("Add a name first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contacts/find-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId, fullName, company, linkedin }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(data?.error ?? "Lookup failed.");
        return;
      }
      if (!data?.email) {
        setMsg("No email found.");
        return;
      }
      if (onFound) {
        onFound(data.email as string);
        setMsg(null);
      } else {
        setMsg(data.email as string);
        router.refresh();
      }
    } catch {
      setMsg("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void find()}
        disabled={busy}
        title="Find work email via Apollo.io"
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Find email
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
