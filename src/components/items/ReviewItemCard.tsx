"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Card } from "@/components/Card";
import { GoalChip } from "@/components/GoalChip";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { ReviewItem } from "@/lib/items/review";

const TYPE_LABEL: Record<ReviewItem["itemType"], string> = {
  task: "Task",
  event: "Event",
  follow_up: "Follow-up",
};

/**
 * One email-derived item in the Review queue, rendered through the provenance-enforcing Card (it
 * cannot show without a working source chip). Accept/Dismiss hit PATCH /api/items; the card then
 * vanishes from the queue. This is the L0 suggest-only approval loop (hard rule #5). Accept is ink,
 * not green - green stays reserved for "done".
 */
export function ReviewItemCard({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "accept" | "dismiss">(null);
  const [done, setDone] = useState<null | "accepted" | "dismissed">(null);

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
      <p className="px-1 py-1 text-xs text-muted-foreground">
        {done === "accepted" ? "Accepted" : "Dismissed"} · {item.title}
      </p>
    );
  }

  return (
    <Card
      variant="row"
      title={item.title}
      source={item.source}
      reasoning={item.reasoning ?? undefined}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center rounded border border-border px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {TYPE_LABEL[item.itemType]}
          </span>
          {item.dueAt && <span className="text-muted-foreground">{formatDate(item.dueAt)}</span>}
        </span>
      }
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void act("dismiss")}
            disabled={busy !== null}
            className="text-muted-foreground hover:text-destructive"
          >
            {busy === "dismiss" ? <Loader2 className="animate-spin" /> : <X />}
            Dismiss
          </Button>
          <Button type="button" size="sm" onClick={() => void act("accept")} disabled={busy !== null}>
            {busy === "accept" ? <Loader2 className="animate-spin" /> : <Check />}
            Accept
          </Button>
        </>
      }
    >
      {item.goalTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {item.goalTags.map((g) => (
            <GoalChip key={g.id} title={g.title} />
          ))}
        </div>
      )}
    </Card>
  );
}
