"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Mine already-ingested emails/meetings for action items on demand. Sync only extracts NEW mail, so
 * this is how the user surfaces items from messages that arrived before the extractor ran.
 */
export function BackfillButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/items/backfill", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg(data?.error ?? "Couldn't scan past messages.");
        return;
      }
      const scanned = Number(data?.scanned ?? 0);
      const inserted = Number(data?.inserted ?? 0);
      const candidates = Number(data?.candidates ?? 0);
      const remaining = Number(data?.remaining ?? 0);
      const hint = remaining ? ` ${remaining} more to scan, click again.` : "";
      if (scanned === 0) {
        setMsg("No un-scanned messages left. Sync new email to find more.");
      } else if (candidates > 0) {
        // Honest phrasing: `candidates` is everything the extractor proposed, `inserted` is what
        // survived the source-quote + confidence checks. The gap is candidates that didn't make the
        // cut, not items that "failed to verify".
        setMsg(
          `${scanned} message${scanned === 1 ? "" : "s"} scanned · ${candidates} candidate${candidates === 1 ? "" : "s"} found, ${inserted} kept.${hint}`,
        );
      } else {
        setMsg(`Scanned ${scanned} message${scanned === 1 ? "" : "s"}, nothing actionable.${hint}`);
      }
      router.refresh();
    } catch {
      setMsg("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-accent" />}
        {busy ? "Scanning…" : "Scan past emails"}
      </button>
      {msg && <p className="max-w-xs text-right text-xs text-muted">{msg}</p>}
    </div>
  );
}
