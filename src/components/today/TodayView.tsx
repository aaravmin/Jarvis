"use client";

import { useCallback, useMemo, useState } from "react";
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
  Plug,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/Card";
import { SourceChip } from "@/components/SourceChip";
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

const KIND_META: Record<AttentionEntry["kind"], { label: string; icon: LucideIcon }> = {
  task: { label: "Task", icon: CheckSquare },
  follow_up: { label: "Follow-up", icon: Reply },
  event: { label: "Event", icon: CalendarClock },
};

const DONE_DISPLAY_CAP = 8;

type Tone = "danger" | "success" | "neutral";
const TONE_CLASS: Record<Tone, string> = {
  danger: "font-medium text-danger",
  success: "font-medium text-success",
  neutral: "text-muted-strong",
};

function dueLabel(entry: AttentionEntry): { text: string; tone: Tone } | null {
  if (entry.status === "done") return { text: "Done", tone: "success" };
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

export function TodayView({ initialFeed }: { initialFeed: AttentionFeed }) {
  const router = useRouter();
  const [feed, setFeed] = useState(initialFeed);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const total = useMemo(() => BUCKET_ORDER.reduce((n, b) => n + feed.buckets[b].length, 0), [feed]);

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
          <Link
            href="/connections"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
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
        <button
          type="button"
          onClick={refresh}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
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
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-strong">
      <Icon className="h-2.5 w-2.5 text-accent" /> {meta.label}
    </span>
  );
}

function GoalChip({ title }: { title: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong">
      <Target className="h-3 w-3" strokeWidth={2} />
      {title}
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
  return (
    <div className="flex items-start gap-2.5">
      {entry.origin === "item" ? (
        <CompleteCheckbox checked={entry.status === "done"} busy={busy} onClick={onToggle} />
      ) : (
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
        >
          {(entry.goalTags.length > 0 || entry.meetingTopics.length > 0) && (
            <div className="space-y-1.5">
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
