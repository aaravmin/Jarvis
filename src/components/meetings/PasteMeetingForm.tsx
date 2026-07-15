"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Paste a meeting transcript and let Otto pull the action items out of it. The transcript is stored
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
    <div className="rounded-md border bg-card p-3">
      <p className="mb-2 text-sm font-medium text-foreground">Pull tasks from a meeting</p>
      <div className="space-y-2">
        <Input placeholder="Meeting name (optional), e.g. Advisor sync" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          className="min-h-[160px] resize-y"
          placeholder="Paste a transcript or notes. Otto proposes action items, each with the exact line it came from."
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button type="button" size="sm" onClick={() => void extract()} disabled={!canExtract}>
          {busy && <Loader2 className="animate-spin" />}
          Extract action items
        </Button>
        {msg && <span className={`text-xs ${msg.tone === "ok" ? "text-success" : "text-destructive"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
