"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Loader2, Sparkles } from "lucide-react";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted";

/**
 * Paste a meeting transcript and let Jarvis pull the action items out of it. The transcript is stored
 * as a `meeting` source and mined by the same extractor the inbox uses; results land in the Review
 * queue (suggest-only). Nothing here computes a date or invents a task, that's enforced server-side.
 */
export function PasteMeetingForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  async function extract() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/meetings/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, transcript }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ tone: "warn", text: d?.error ?? "Could not extract action items." });
        return;
      }
      const n = d.inserted ?? 0;
      setMsg({
        tone: "ok",
        text: n > 0 ? `${n} action ${n === 1 ? "item" : "items"} sent to Review.` : "No action items found in this transcript.",
      });
      setTitle("");
      setTranscript("");
      router.refresh();
    } catch {
      setMsg({ tone: "warn", text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const canExtract = transcript.trim().length >= 20 && !busy;

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Mic className="h-4 w-4 text-accent" />
        <p className="text-sm font-semibold text-foreground">Pull tasks from a meeting</p>
      </div>
      <div className="space-y-2">
        <input
          className={input}
          placeholder="Meeting name (optional), e.g. Advisor sync"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className={`${input} min-h-[180px] resize-y`}
          placeholder="Paste the transcript or your notes here. Jarvis reads it and proposes the action items, each with the exact line it came from."
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void extract()}
          disabled={!canExtract}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Extract action items
        </button>
        {msg && <span className={`text-xs ${msg.tone === "ok" ? "text-success" : "text-warning"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
