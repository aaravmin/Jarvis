"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2 } from "lucide-react";
import type { ApplicationKind } from "@/lib/agents/application/types";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

const KINDS: { value: ApplicationKind; label: string }[] = [
  { value: "job", label: "Job / internship" },
  { value: "grant", label: "Grant / fellowship" },
  { value: "other", label: "Other" },
];

/**
 * Prepare an application from a link. The agent reads the form and fills what it can ground in the
 * user's documents, it never submits. Accepts prefilled values (e.g. launched from an Opportunity)
 * and auto-runs once when `autostart` is set.
 */
export function PrepareApplicationForm({
  initialUrl = "",
  initialKind = "job",
  opportunityId,
  autostart = false,
}: {
  initialUrl?: string;
  initialKind?: ApplicationKind;
  opportunityId?: string;
  autostart?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [kind, setKind] = useState<ApplicationKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  async function prepare() {
    if (!url.trim()) {
      setErr("Paste the application link first.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/applications/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl: url.trim(), kind, opportunityId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? "Couldn't prepare that application.");
        return;
      }
      router.refresh();
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autostart && initialUrl && !started.current) {
      started.current = true;
      void prepare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, initialUrl]);

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className={input}
          placeholder="Paste an application link (https://…)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && void prepare()}
        />
        <select
          className={`${input} sm:w-52`}
          value={kind}
          onChange={(e) => setKind(e.target.value as ApplicationKind)}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {busy ? "Reading the form…" : "Prepare"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
      <p className="mt-2 text-xs text-muted">
        Jarvis reads the form and fills what it can ground in your documents, it never submits. You
        review and submit.
      </p>
    </div>
  );
}
