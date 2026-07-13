import type { Bucket } from "@/lib/priority/types";

/**
 * Deterministic priority scoring. NO LLM, NO Math.random, NO hidden clock: `now` is always passed in
 * so the whole thing is a pure function and trivially testable. Dates arriving here are ALREADY
 * resolved (chrono did that at extraction time, hard rule #2); we only compare timestamps.
 *
 * Two outputs per entry:
 *   - bucket: the temporal tier the UI groups by (overdue/today/soon/later/done).
 *   - score:  a continuous importance value that orders entries WITHIN a bucket (higher first).
 *
 * Design: the temporal tier sets the coarse order (overdue highest, then today, soon, later/undated;
 * done last). Goal linkage is a strong refinement on top, so a goal-grounded item floats to the top
 * of its tier - that is the product thesis (importance is grounded in the user's goals). Item type
 * and confidence are minor nudges/tiebreakers.
 */

const DAY_MS = 86_400_000;

/** Display order of the buckets, top to bottom. The UI iterates this; it never invents an order. */
export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "soon", "later", "done"];

/** UI metadata per bucket so red/green and labels live in one place, never re-derived downstream. */
export const BUCKET_META: Record<Bucket, { label: string; tone: "danger" | "warning" | "neutral" | "success" }> = {
  overdue: { label: "Overdue", tone: "danger" },
  today: { label: "Today", tone: "warning" },
  soon: { label: "Next 7 days", tone: "neutral" },
  later: { label: "Later", tone: "neutral" },
  done: { label: "Done", tone: "success" },
};

/** Coarse temporal tier score. Gaps of 100 keep the tiers ordered for otherwise-equal items. */
const TEMPORAL_BASE: Record<Bucket, number> = {
  overdue: 500,
  today: 400,
  soon: 300,
  later: 200,
  done: 0,
};

export type ScoreInput = {
  kind: "task" | "follow_up" | "event";
  /** Resolved deadline (ISO) for items; null for calendar events and undated items. */
  dueAt: string | null;
  /** Start time (ISO) for calendar events; drives the tier + intra-day ordering when present. */
  startsAt?: string | null;
  status: "accepted" | "done";
  /** Count of ACCEPTED goal links on this entry. More matched goals = bigger boost. */
  goalCount: number;
  /** 0..1 extractor confidence; only a weak tiebreaker. */
  confidence?: number | null;
};

export type Scored = { score: number; bucket: Bucket };

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Whole-day delta between the anchor's local day and now's local day (0 = today, <0 = overdue). */
function dayDelta(anchorMs: number, now: Date): number {
  return Math.round((startOfDay(new Date(anchorMs)) - startOfDay(now)) / DAY_MS);
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** The temporal tier for an entry. Calendar events anchor on start time; items on their due date. */
export function bucketFor(input: ScoreInput, now: Date): Bucket {
  if (input.status === "done") return "done";
  const anchorMs = parseMs(input.startsAt ?? null) ?? parseMs(input.dueAt);
  if (anchorMs === null) return "later"; // undated open work lives in 'later'
  const delta = dayDelta(anchorMs, now);
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  if (delta <= 7) return "soon";
  return "later";
}

/** Small, bounded refinement by time proximity so nearer work ranks a bit higher inside its tier. */
function proximityRefine(anchorMs: number | null, bucket: Bucket, now: Date): number {
  if (bucket === "done" || anchorMs === null) return 0;
  const delta = dayDelta(anchorMs, now);
  if (delta < 0) return Math.min(60, -delta * 3); // more overdue = a touch higher (capped)
  if (delta === 0) return 50; // due today
  if (delta <= 7) return (8 - delta) * 6; // 42 (tomorrow) .. 6 (day 7)
  return Math.max(0, 30 - (delta - 7)); // just past a week ranks a hair above far-off
}

/**
 * Sub-day ordering for timed calendar events so an early meeting sorts above a late one within a day.
 * Only meaningful when there is a real clock time (all-day events return 0). Bounded to 0..8.
 */
function eventTimeRefine(startsAt: string | null | undefined, allDay: boolean): number {
  if (allDay) return 0;
  const ms = parseMs(startsAt ?? null);
  if (ms === null) return 0;
  const d = new Date(ms);
  const minutesIntoDay = d.getHours() * 60 + d.getMinutes();
  return (1 - minutesIntoDay / 1440) * 8; // 08:00 higher than 17:00
}

/** Strong boost for goal linkage: the whole point is that goal-grounded work rises to attention. */
function goalBoost(goalCount: number): number {
  if (goalCount <= 0) return 0;
  return 90 + (goalCount - 1) * 45; // 1 goal = 90, each extra goal = +45
}

function typeBoost(kind: ScoreInput["kind"]): number {
  return kind === "follow_up" ? 12 : 0; // an owed reply is a little stickier than a plain task
}

/**
 * Score one entry deterministically. `allDay` matters only for timed-event sub-ordering; callers pass
 * it for calendar events (default false for items).
 */
export function scoreItem(input: ScoreInput, now: Date, allDay = false): Scored {
  const bucket = bucketFor(input, now);
  const anchorMs = parseMs(input.startsAt ?? null) ?? parseMs(input.dueAt);
  const undated = anchorMs === null && bucket !== "done";

  let score = TEMPORAL_BASE[bucket];
  score += proximityRefine(anchorMs, bucket, now);
  score += goalBoost(input.goalCount);
  score += typeBoost(input.kind);
  score += (typeof input.confidence === "number" ? input.confidence : 0.5) * 6; // weak tiebreaker
  if (input.kind === "event") score += eventTimeRefine(input.startsAt, allDay);
  if (undated) score -= 30; // undated open work sits below dated work in the same tier

  return { score, bucket };
}
