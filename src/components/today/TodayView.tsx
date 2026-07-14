"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Sun,
  Target,
  Link2,
  Check,
  Loader2,
  CheckSquare,
  CalendarClock,
  Reply,
  Hourglass,
  ArrowUpRight,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/Card";
import { GoalChip } from "@/components/GoalChip";
import { SourceChip } from "@/components/SourceChip";
import { SyncAllButton } from "@/components/today/SyncAllButton";
import { syncAllAccounts } from "@/components/today/sync-all";
import { formatWhen, formatEventTime } from "@/lib/format";
import { BUCKET_META, BUCKET_ORDER, scoreItem } from "@/lib/priority/score";
import type { AttentionEntry, AttentionFeed, Bucket } from "@/lib/priority/types";

/**
 * The Today "attention" surface, the home page of Jarvis. `initialFeed` is server-rendered (loaded via
 * loadAttention in the page) for a fast first paint; this component only owns interaction on top of it:
 * inline complete (optimistic) and a manual refresh. Buckets are rendered in BUCKET_ORDER, empty ones
 * skipped. Overdue carries a red left border, done is compact and green, everything else stays neutral,
 * red and green are the only loud colors (per the product's design brief).
 */

const KIND_META: Record<AttentionEntry["kind"], { label: string; icon: LucideIcon; pill?: "reply" | "nudge" }> = {
  task: { label: "Task", icon: CheckSquare },
  follow_up: { label: "Follow-up", icon: Reply },
  event: { label: "Event", icon: CalendarClock },
  needs_reply: { label: "Needs reply", icon: Reply, pill: "reply" },
  waiting_on: { label: "Waiting on them", icon: Hourglass, pill: "nudge" },
};

const DONE_DISPLAY_CAP = 8;

// Auto-sync-on-open fires at most once per browser session, and only when our newest data is this old.
const AUTOSYNC_STALE_MS = 6 * 60 * 60 * 1000; // 6h
const AUTOSYNC_GUARD = "jarvis-autosync";
const SYNCED_SUFFIX = "auto-syncs when you open Jarvis";

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
  return rel === "just now" ? `Synced just now · ${SYNCED_SUFFIX}` : `Synced ${rel} ago · ${SYNCED_SUFFIX}`;
}

type Tone = "danger" | "success" | "neutral";
const TONE_CLASS: Record<Tone, string> = {
  danger: "font-medium text-danger",
  success: "font-medium text-success",
  neutral: "text-muted-strong",
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
}: {
  initialFeed: AttentionFeed;
  notionEnabled: boolean;
  newestSourceAt: string | null;
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

  if (total === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-surface-2">
          <Sun className="h-6 w-6 text-accent" strokeWidth={1.75} />
        </span>
        <h2 className="text-base font-semibold text-foreground">Nothing needs your attention</h2>
        <p className="max-w-sm text-sm text-muted">
          Connect Gmail, Calendar, and Notion so Jarvis can find what is on your plate, and set a goal
          or two so it knows what matters to you.
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <SyncAllButton notionEnabled={notionEnabled} />
          <Link
            href="/connections"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-muted-strong transition-colors hover:bg-surface-3"
          >
            <Plug className="h-4 w-4" /> Connect your accounts
          </Link>
          <Link
            href="/goals"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-muted-strong transition-colors hover:bg-surface-3"
          >
            <Target className="h-4 w-4" /> Set your goals
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent">
            <Sun className="h-3.5 w-3.5" /> Today
          </p>
          <h1 className="mt-1 text-lg font-semibold text-foreground">What matters most</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-strong">
            Ordered by importance and grounded in your goals. Overdue is red, done is green.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <SyncAllButton notionEnabled={notionEnabled} />
          </div>
          <p className="text-[11px] text-muted">{autoSyncing ? "Syncing your accounts..." : syncedLabel}</p>
        </div>
      </header>

      {actionError && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</p>
      )}

      {BUCKET_ORDER.map((bucket) => {
        const entries = feed.buckets[bucket];
        if (!entries.length) return null;
        const meta = BUCKET_META[bucket];
        const isOverdue = bucket === "overdue";
        const isDone = bucket === "done";

        return (
          <section key={bucket} className={isOverdue ? "space-y-3 border-l-2 border-danger/60 pl-3 sm:pl-4" : "space-y-3"}>
            <h2
              className={`text-xs font-semibold uppercase tracking-wider ${
                isOverdue ? "text-danger" : isDone ? "text-success" : "text-muted-strong"
              }`}
            >
              {meta.label} <span className="font-normal normal-case text-muted">({entries.length})</span>
            </h2>

            {isDone ? (
              <DoneList entries={entries.slice(0, DONE_DISPLAY_CAP)} pending={pending} onToggle={toggle} />
            ) : (
              <ul className="space-y-3">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <EntryRow entry={entry} busy={pending.has(entry.id)} onToggle={() => void toggle(entry)} />
                  </li>
                ))}
              </ul>
            )}

            {isDone && entries.length > DONE_DISPLAY_CAP && (
              <p className="text-xs text-muted">
                +{entries.length - DONE_DISPLAY_CAP} more done, see the{" "}
                <Link href="/tasks" className="text-accent hover:underline">
                  Tasks
                </Link>{" "}
                list.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function KindPill({ kind }: { kind: AttentionEntry["kind"] }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  // needs_reply is red-tinted (you owe a reply); waiting_on is a neutral "the ball is in their court".
  const shell =
    meta.pill === "reply"
      ? "border-danger/35 bg-danger/5 text-danger"
      : meta.pill === "nudge"
        ? "border-border-strong bg-surface-3 text-muted-strong"
        : "border-border text-muted-strong";
  const iconColor = meta.pill === "reply" ? "text-danger" : "text-accent";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${shell}`}>
      <Icon className={`h-2.5 w-2.5 ${iconColor}`} /> {meta.label}
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
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 ${
        checked ? "border-success/50 bg-success/15 text-success" : "border-border text-transparent hover:border-accent/60"
      }`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin text-muted" /> : <Check className="h-3.5 w-3.5" />}
    </button>
  );
}

function EntryRow({ entry, busy, onToggle }: { entry: AttentionEntry; busy: boolean; onToggle: () => void }) {
  const due = dueLabel(entry);
  const isReply = entry.origin === "reply";
  const hasBody = isReply || entry.goalTags.length > 0 || entry.meetingTopics.length > 0;
  return (
    <div className="flex items-start gap-2.5">
      {entry.origin === "item" ? (
        <CompleteCheckbox checked={entry.status === "done"} busy={busy} onClick={onToggle} />
      ) : (
        // Reply entries and calendar events aren't checkable — they clear themselves. Keep the spacer.
        <span className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <Card
          title={entry.title}
          source={entry.source}
          reasoning={entry.reasoning ?? undefined}
          meta={
            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
              <KindPill kind={entry.kind} />
              {due && <span className={TONE_CLASS[due.tone]}>{due.text}</span>}
            </span>
          }
          actions={entry.threadLink ? <ReplyAction entry={entry} /> : undefined}
        >
          {hasBody && (
            <div className="space-y-1.5">
              {isReply && entry.source.quote && (
                <p className="text-xs italic leading-relaxed text-muted">&ldquo;{entry.source.quote}&rdquo;</p>
              )}
              {entry.goalTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {entry.goalTags.map((g) => (
                    <GoalChip key={g.goalId} title={g.title} />
                  ))}
                </div>
              )}
              {entry.meetingTopics.length > 0 && (
                <p className="flex flex-wrap items-start gap-1.5 text-xs text-muted">
                  <Link2 className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
                  <span>
                    <span className="text-muted-strong">Likely topics: </span>
                    {entry.meetingTopics.map((t) => t.title).join(", ")}
                  </span>
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/** One-click deep link into the Gmail thread. Jarvis never drafts or sends — the user replies in Gmail. */
function ReplyAction({ entry }: { entry: AttentionEntry }) {
  const label = entry.kind === "waiting_on" ? "Nudge in Gmail" : "Reply in Gmail";
  return (
    <a
      href={entry.threadLink}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-accent/30 bg-surface-2 px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-surface-3"
    >
      {label} <ArrowUpRight className="h-3.5 w-3.5" />
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
    <ul className="space-y-1.5">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/70 px-3 py-2">
          <CompleteCheckbox checked busy={pending.has(entry.id)} onClick={() => onToggle(entry)} />
          <p className="min-w-0 flex-1 truncate text-sm text-muted line-through">{entry.title}</p>
          <SourceChip source={entry.source} />
        </li>
      ))}
    </ul>
  );
}
