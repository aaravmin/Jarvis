"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Link2 } from "lucide-react";

/**
 * Paste one LinkedIn profile URL → Jarvis reads the page (role, company, bio) and, when Apollo is
 * configured, their work email, then drops the person straight into the Contacts tab. POSTs to
 * /api/contacts/import-linkedin; on success it refreshes so the new card appears. A needsLogin result
 * (LinkedIn auth wall) is shown as a warning, a window was opened for the user to sign into.
 */
export function AddFromLinkedIn({ apolloEnabled = false }: { apolloEnabled?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "bad">("ok");

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contacts/import-linkedin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTone("bad");
        setMsg(data?.error ?? "Import failed.");
      } else {
        setTone(data?.needsLogin ? "warn" : data?.ok ? "ok" : "bad");
        setMsg(data?.message ?? "Done.");
        if (data?.ok && !data?.needsLogin && !data?.alreadyExisted) {
          setUrl("");
          router.refresh();
        }
      }
    } catch {
      setTone("bad");
      setMsg("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const looksValid = /linkedin\.com\/in\//i.test(url);
  const toneClass = tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "text-danger";

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Add a contact from a LinkedIn URL</h2>
      </div>
      <p className="mb-3 text-xs text-muted">
        Paste someone&apos;s LinkedIn profile link. Jarvis reads their role, company, and bio
        {apolloEnabled ? ", looks up their work email," : ""} and adds them to your contacts.
        {apolloEnabled ? "" : " Set APOLLO_API_KEY to also pull their work email."}
      </p>
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          placeholder="https://www.linkedin.com/in/…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
          onKeyDown={(e) => {
            if (e.key === "Enter" && looksValid && !busy) void run();
          }}
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !looksValid}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Reading…" : "Import"}
        </button>
      </div>
      {msg && <p className={`mt-2 text-xs ${toneClass}`}>{msg}</p>}
    </section>
  );
}
