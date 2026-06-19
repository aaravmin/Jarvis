"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X, CheckSquare, CalendarClock, Reply } from "lucide-react";
import { Card } from "@/components/Card";
import { formatDate } from "@/lib/format";
import type { ReviewItem } from "@/lib/items/review";

const TYPE_META: Record<ReviewItem["itemType"], { label: string; icon: typeof CheckSquare }> = {
  task: { label: "Task", icon: CheckSquare },
  event: { label: "Event", icon: CalendarClock },
  follow_up: { label: "Follow-up", icon: Reply },
};

/**
 * One email-derived item in the Review queue, rendered through the provenance-enforcing Card (it
 * cannot show without a working source chip). Accept/Dismiss hit PATCH /api/items; the card then
 * vanishes from the queue. This is the L0 suggest-only approval loop (hard rule #5).
 */
export function ReviewItemCard({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "accept" | "dismiss">(null);
  const [done, setDone] = useState<null | "accepted" | "dismissed">(null);
  const meta = TYPE_META[item.itemType];
  const Icon = meta.icon;

  async function act(action: "accept" | "dismiss") {
    setBusy(action);
    const res = await fetch("/api/items", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.id, action }),
    });
    if (res.ok) {
      setDone(action === "accept" ? "accepted" : "dismissed");
      router.refresh();
    } else {
      setBusy(null);
    }
  }

  if (done) {
    return (
      <p className="rounded-xl border border-border bg-surface-2/50 px-4 py-2.5 text-xs text-muted">
        {done === "accepted" ? "Accepted" : "Dismissed"} · {item.title}
      </p>
    );
  }

  return (
    <Card
      title={item.title}
      source={item.source}
      reasoning={item.reasoning ?? undefined}
      meta={
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-strong">
            <Icon className="h-3 w-3 text-accent" /> {meta.label}
          </span>
          {item.dueAt && <span>{formatDate(item.dueAt)}</span>}
        </span>
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => void act("dismiss")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-danger disabled:opacity-50"
          >
            {busy === "dismiss" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => void act("accept")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-[#04181f] transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {busy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Accept
          </button>
        </>
      }
    />
  );
}
