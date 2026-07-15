"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { ReviewItemCard } from "@/components/items/ReviewItemCard";
import { Button } from "@/components/ui/button";
import type { ReviewItem } from "@/lib/items/review";

/**
 * Owns multi-select state for the Review queue: a checkbox beside each row, a faint fill on selected
 * rows, and a bulk bar (Accept N / Dismiss N) once at least one is selected. Per-row Accept/Dismiss
 * inside ReviewItemCard keep working independently; this only adds the batch path on top of it (same
 * PATCH /api/items endpoint, just with `ids` instead of `id`).
 *
 * `items` arrives already sorted by priority (lib/items/review.ts); we render that order as-is and
 * never re-sort client-side.
 */
export function ReviewList({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | "accept" | "dismiss">(null);

  // Drop selection for any id that vanished from the queue (e.g. accepted/dismissed via its own
  // per-row button), so the bulk bar's count never lags reality.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkAct(action: "accept" | "dismiss") {
    const ids = Array.from(selected);
    if (!ids.length || bulkBusy) return;
    setBulkBusy(action);
    try {
      const res = await fetch("/api/items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBulkBusy(null);
    }
  }

  const count = selected.size;

  return (
    <div className="space-y-2">
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
          <span className="font-medium text-foreground">{count} selected</span>
          <Button size="sm" onClick={() => void bulkAct("accept")} disabled={bulkBusy !== null}>
            {bulkBusy === "accept" ? <Loader2 className="animate-spin" /> : <Check />}
            Accept {count}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void bulkAct("dismiss")}
            disabled={bulkBusy !== null}
            className="text-muted-foreground"
          >
            {bulkBusy === "dismiss" ? <Loader2 className="animate-spin" /> : <X />}
            Dismiss {count}
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground">By priority: due date, then goals</span>
        </div>
      )}

      <ul className="divide-y overflow-hidden rounded-md border bg-card">
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <li
              key={item.id}
              className={`flex items-start gap-2.5 px-3 py-2 transition-colors ${
                isSelected ? "bg-secondary/50" : "hover:bg-secondary/30"
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={isSelected}
                aria-label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
                className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input text-transparent hover:border-primary/60"
                }`}
              >
                <Check className="size-3" />
              </button>
              <div className="min-w-0 flex-1">
                <ReviewItemCard item={item} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
