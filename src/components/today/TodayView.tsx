"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, Check, Loader2, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/Card";
import { GoalChip } from "@/components/GoalChip";
import { SourceChip } from "@/components/SourceChip";
import { Button } from "@/components/ui/button";
import { SyncAllButton } from "@/components/today/SyncAllButton";
import { BackfillButton } from "@/components/items/BackfillButton";
import { ReviewItemCard } from "@/components/items/ReviewItemCard";
import { syncAllAccounts } from "@/components/today/sync-all";
import { formatWhen, formatEventTime } from "@/lib/format";
import { BUCKET_META, BUCKET_ORDER, scoreItem } from "@/lib/priority/score";
import type { AttentionEntry, AttentionFeed, Bucket } from "@/lib/priority/types";
import type { ReviewItem } from "@/lib/items/review";

/**
 * The Today "attention" surface, the home page of Otto. `initialFeed` is server-rendered (loaded via
 * loadAttention in the page) for a fast first paint; this component only owns interaction on top of it:
 * inline complete (optimistic) and a manual refresh. Buckets render as dense sheet rows in BUCKET_ORDER,
 * empty ones skipped. Red is used ONLY for overdue/owed replies and green ONLY for done; everything else
 * stays neutral ink (the product's design brief).
 *
 * `reviewItems` are the pending suggestions (status='review'). They render as a "Suggested" section at
 * the very end of the feed, each with per-item Accept/Dismiss (ReviewItemCard -> PATCH /api/items).
 * This is the L0 approval gate (hard rule #5): nothing is auto-accepted; the user approves each one.
 */

// Kind is shown as a quiet text tag. `pill: "reply"` tints it red (you owe a reply); everything else
// is neutral. No icons - the label carries the meaning.
const KIND_META: Record<AttentionEntry["kind"], { label: string; pill?: "reply" | "nudge" }> = {
  task: { label: "Task" },
  follow_up: { label: "Follow-up" },
  event: { label: "Event" },
  needs_reply: { label: "Needs reply", pill: "reply" },
  waiting_on: { label: "Waiting", pill: "nudge" },
};

const DONE_DISPLAY_CAP = 8;

// Auto-sync-on-open fires at most once per browser session, and only when our newest data is this old.
const AUTOSYNC_STALE_MS = 6 * 60 * 60 * 1000; // 6h
const AUTOSYNC_GUARD = "otto-autosync";
const SYNCED_SUFFIX = "auto-syncs on open";

/** Plain-code relative age (display only; not a provenance date computation). */
function relativeAgo(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"}`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

/** The header's freshness line, computed from the newest source time with plain code. */
function syncedAgoLabel(newestSourceAt: string | null): string {
  if (!newestSourceAt) return SYNCED_SUFFIX;
  const ms = Date.now() - new Date(newestSourceAt).getTime();
  if (Number.isNaN(ms)) return SYNCED_SUFFIX;
  const rel = relativeAgo(ms);
  return rel === "just now" ? `Synced just now` : `Synced ${rel} ago`;
}

type Tone = "danger" | "success" | "neutral";
const TONE_CLASS: Record<Tone, string> = {
  danger: "font-medium text-destructive",
  success: "font-medium text-success",
  neutral: "text-muted-foreground",
};

function dueLabel(entry: AttentionEntry): { text: string; tone: Tone } | null {
  if (entry.status === "done") return { text: "Done", tone: "success" };
  if (entry.kind === "needs_reply") {
    const d = entry.waitingDays ?? 0;
    return { text: `Waiting on you - ${d} day${d === 1 ? "" : "s"}`, tone: entry.bucket === "overdue" ? "danger" : "neutral" };
  }
  if (entry.kind === "waiting_on") {
    const d = entry.waitingDays ?? 0;
    return { text: `Sent ${d} day${d === 1 ? "" : "s"} ago`, tone: "neutral" };
  }
  if (entry.origin === "calendar") {
    const text = formatEventTime(entry.startsAt ?? undefined, entry.endsAt ?? undefined, entry.allDay);
    return text ? { text, tone: entry.bucket === "overdue" ? "danger" : "neutral" } : null;
  }
  if (!entry.dueAt) return null;
  if (entry.bucket === "overdue") return { text: `Overdue - ${formatWhen(entry.dueAt)}`, tone: "danger" };
  return { text: `Due ${formatWhen(entry.dueAt)}`, tone: "neutral" };
}

/** Move an entry between buckets client-side, re-sorted the same way loadAttention sorts (score desc,
 * then title). Keeps the feed's shape correct after an optimistic complete/un-complete without a round
 * trip to the server. */
function moveEntry(feed: AttentionFeed, fromBucket: Bucket, updated: AttentionEntry): AttentionFeed {
  const buckets = { ...feed.buckets };
  buckets[fromBucket] = buckets[fromBucket].filter((e) => e.id !== updated.id);
  buckets[updated.bucket] = [...buckets[updated.bucket], updated].sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title),
  );
  return { ...feed, buckets };
}

export function TodayView({
  initialFeed,
  notionEnabled,
  newestSourceAt,
  reviewItems,
}: {
  initialFeed: AttentionFeed;
  notionEnabled: boolean;
  newestSourceAt: string | null;
  reviewItems: ReviewItem[];
}) {
  const router = useRouter();
  const [feed, setFeed] = useState(initialFeed);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  // Rendered on the client only (avoids an SSR/CSR hydration mismatch on the relative time).
  const [syncedLabel, setSyncedLabel] = useState<string>(SYNCED_SUFFIX);

  const total = useMemo(() => BUCKET_ORDER.reduce((n, b) => n + feed.buckets[b].length, 0), [feed]);

  useEffect(() => {
    setSyncedLabel(syncedAgoLabel(newestSourceAt));
  }, [newestSourceAt]);

  // Auto-sync when the newest data we hold is stale (or absent), at most once per browser session.
  // The guard is set BEFORE the async call so a fast second mount can't double-fire it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(AUTOSYNC_GUARD)) return;
    const stale = !newestSourceAt || Date.now() - new Date(newestSourceAt).getTime() > AUTOSYNC_STALE_MS;
    if (!stale) return;
    sessionStorage.setItem(AUTOSYNC_GUARD, "1");
    setAutoSyncing(true);
    void syncAllAccounts(notionEnabled).finally(() => {
      setAutoSyncing(false);
      router.refresh();
    });
  }, [newestSourceAt, notionEnabled, router]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() re-runs the server component; the page remounts us with a fresh key once the
    // new feed lands, so this just clears the spinner after a moment for feedback.
    window.setTimeout(() => setRefreshing(false), 600);
  }, [router]);

  const toggle = useCallback(
    async (entry: AttentionEntry) => {
      if (entry.origin !== "item") return; // calendar events aren't checkable action items
      const nextStatus: "accepted" | "done" = entry.status === "done" ? "accepted" : "done";
      const { score, bucket } = scoreItem(
        { kind: entry.kind, dueAt: entry.dueAt, status: nextStatus, goalCount: entry.goalTags.length, confidence: entry.confidence },
        new Date(),
      );
      const updated: AttentionEntry = { ...entry, status: nextStatus, score, bucket };

      setActionError(null);
      setPending((s) => new Set(s).add(entry.id));
      setFeed((prev) => moveEntry(prev, entry.bucket, updated));

      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: entry.id, status: nextStatus }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setFeed((prev) => moveEntry(prev, updated.bucket, entry));
        setActionError("Could not update that item. Try again.");
      } finally {
        setPending((s) => {
          const n = new Set(s);
          n.delete(entry.id);
          return n;
        });
      }
    },
    [],
  );

  if (total === 0 && reviewItems.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <h2 className="text-sm font-semibold text-foreground">Nothing needs your attention</h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          Connect your accounts and set a goal or two so Otto knows what matters.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <SyncAllButton notionEnabled={notionEnabled} />
          <Button asChild variant="outline" size="sm">
            <Link href="/connections">Connect accounts</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/goals">Set goals</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4">
        <h1 className="text-base font-semibold tracking-tight text-foreground">Today</h1>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className={refreshing ? "animate-spin" : ""} />
              Refresh
            </Button>
            <BackfillButton />
            <SyncAllButton notionEnabled={notionEnabled} />
          </div>
          <p className="text-[11px] text-muted-foreground">{autoSyncing ? "Syncing..." : syncedLabel}</p>
        </div>
      </header>

      {actionError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{actionError}</p>
      )}

      {BUCKET_ORDER.map((bucket) => {
        const entries = feed.buckets[bucket];
        if (!entries.length) return null;
        const meta = BUCKET_META[bucket];
        const isOverdue = bucket === "overdue";
        const isDone = bucket === "done";

        return (
          <section key={bucket} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h2
                className={`text-[11px] font-semibold uppercase tracking-wide ${
                  isOverdue ? "text-destructive" : isDone ? "text-success" : "text-muted-foreground"
                }`}
              >
                {meta.label}
              </h2>
              <span className="text-[11px] text-muted-foreground">{entries.length}</span>
            </div>

            {isDone ? (
              <DoneList entries={entries.slice(0, DONE_DISPLAY_CAP)} pending={pending} onToggle={toggle} />
            ) : (
              <ul
                className={`divide-y overflow-hidden rounded-md border bg-card ${
                  isOverdue ? "border-l-2 border-l-destructive/60" : ""
                }`}
              >
                {entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} busy={pending.has(entry.id)} onToggle={() => void toggle(entry)} />
                ))}
              </ul>
            )}

            {isDone && entries.length > DONE_DISPLAY_CAP && (
              <p className="text-[11px] text-muted-foreground">
                +{entries.length - DONE_DISPLAY_CAP} more in{" "}
                <Link href="/tasks" className="text-primary hover:underline">
                  Tasks
                </Link>
              </p>
            )}
          </section>
        );
      })}

      {reviewItems.length > 0 && (
        <section className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested</h2>
            <span className="text-[11px] text-muted-foreground">{reviewItems.length}</span>
            <span className="text-[11px] text-muted-foreground">· nothing is auto-accepted</span>
          </div>
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {reviewItems.map((item) => (
              <li key={item.id} className="px-3 py-2 transition-colors hover:bg-secondary/40">
                <ReviewItemCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function KindTag({ kind }: { kind: AttentionEntry["kind"] }) {
  const meta = KIND_META[kind];
  const cls =
    meta.pill === "reply"
      ? "border-destructive/30 text-destructive"
      : "border-border text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded border px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {meta.label}
    </span>
  );
}

function CompleteCheckbox({ checked, busy, onClick }: { checked: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={checked ? "Mark not done" : "Mark done"}
      className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50 ${
        checked ? "border-success/50 bg-success/15 text-success" : "border-input text-transparent hover:border-primary/60"
      }`}
    >
      {busy ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : <Check className="size-3" />}
    </button>
  );
}

function EntryRow({ entry, busy, onToggle }: { entry: AttentionEntry; busy: boolean; onToggle: () => void }) {
  const due = dueLabel(entry);
  const isReply = entry.origin === "reply";
  const hasBody = isReply || entry.goalTags.length > 0 || entry.meetingTopics.length > 0;
  return (
    <li className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-secondary/40">
      {entry.origin === "item" ? (
        <CompleteCheckbox checked={entry.status === "done"} busy={busy} onClick={onToggle} />
      ) : (
        // Reply entries and calendar events aren't checkable - they clear themselves. Keep the spacer.
        <span className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      )}
      <Card
        variant="row"
        title={entry.title}
        source={entry.source}
        reasoning={entry.reasoning ?? undefined}
        meta={
          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            <KindTag kind={entry.kind} />
            {due && <span className={TONE_CLASS[due.tone]}>{due.text}</span>}
          </span>
        }
        actions={entry.threadLink ? <ReplyAction entry={entry} /> : undefined}
      >
        {hasBody && (
          <div className="space-y-1">
            {isReply && entry.source.quote && (
              <p className="line-clamp-2 text-xs italic leading-snug text-muted-foreground">&ldquo;{entry.source.quote}&rdquo;</p>
            )}
            {entry.goalTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {entry.goalTags.map((g) => (
                  <GoalChip key={g.goalId} title={g.title} />
                ))}
              </div>
            )}
            {entry.meetingTopics.length > 0 && (
              <p className="text-xs leading-snug text-muted-foreground">
                <span className="text-muted-strong">Related: </span>
                {entry.meetingTopics.map((t) => t.title).join(", ")}
              </p>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

/** One-click deep link into the Gmail thread. Otto never drafts or sends - the user replies in Gmail. */
function ReplyAction({ entry }: { entry: AttentionEntry }) {
  const label = entry.kind === "waiting_on" ? "Nudge in Gmail" : "Reply in Gmail";
  return (
    <a
      href={entry.threadLink}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-secondary"
    >
      {label} <ArrowUpRight className="size-3" />
    </a>
  );
}

function DoneList({
  entries,
  pending,
  onToggle,
}: {
  entries: AttentionEntry[];
  pending: Set<string>;
  onToggle: (entry: AttentionEntry) => void;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-md border bg-card">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-2.5 px-3 py-1.5">
          <CompleteCheckbox checked busy={pending.has(entry.id)} onClick={() => onToggle(entry)} />
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through">{entry.title}</p>
          <SourceChip source={entry.source} />
        </li>
      ))}
    </ul>
  );
}
