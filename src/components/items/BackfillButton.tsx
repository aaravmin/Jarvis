"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Mine already-ingested emails/meetings for action items on demand. Sync only extracts NEW mail, so
 * this is how the user surfaces items from messages that arrived before the extractor ran. This is a
 * one-time / power action, so it lives quietly on Connections rather than on the Today header.
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
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? "Scanning older messages…" : "Scan past emails for action items"}
      </button>
      {msg && <p className="max-w-md text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
