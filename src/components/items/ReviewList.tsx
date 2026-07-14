"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { ReviewItemCard } from "@/components/items/ReviewItemCard";
import type { ReviewItem } from "@/lib/items/review";

/**
 * Owns multi-select state for the Review queue: a checkbox beside each card, an accent ring on
 * selected cards, and a bulk bar (Accept N / Dismiss N) once at least one is selected. Per-card
 * Accept/Dismiss inside ReviewItemCard keep working independently, this only adds the batch path on
 * top of it (same PATCH /api/items endpoint, just with `ids` instead of `id`).
 *
 * `items` arrives already sorted by priority (lib/items/review.ts); we render that order as-is and
 * never re-sort client-side.
 */
export function ReviewList({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<null | "accept" | "dismiss">(null);

  // Drop selection for any id that vanished from the queue (e.g. accepted/dismissed via its own
  // per-card button), so the bulk bar's count never lags reality.
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
    <div className="space-y-3">
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-accent text-white">
            <Check className="h-2.5 w-2.5" />
          </span>
          <span className="font-medium text-muted-strong">{count} selected</span>
          <button
            type="button"
            onClick={() => void bulkAct("accept")}
            disabled={bulkBusy !== null}
            className="inline-flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {bulkBusy === "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Accept {count}
          </button>
          <button
            type="button"
            onClick={() => void bulkAct("dismiss")}
            disabled={bulkBusy !== null}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted disabled:opacity-50"
          >
            {bulkBusy === "dismiss" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Dismiss {count}
          </button>
          {/* Static, not a control: there is no other sort to switch to. */}
          <span className="ml-auto shrink-0 text-xs text-muted">Sorted by priority: due date first, then goal relevance</span>
        </div>
      )}

      <div className="space-y-3">
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <div key={item.id} className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => toggle(item.id)}
                aria-pressed={isSelected}
                aria-label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
                className={`mt-4 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  isSelected
                    ? "border-accent bg-accent text-white"
                    : "border-border-strong bg-surface text-transparent hover:border-accent/60"
                }`}
              >
                <Check className="h-2.5 w-2.5" />
              </button>
              <div className={`min-w-0 flex-1 rounded-xl ${isSelected ? "ring-1 ring-accent" : ""}`}>
                <ReviewItemCard item={item} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
