import type { CardSource } from "@/lib/types";

/**
 * Shared shapes for the deterministic priority engine (the Today "attention" surface).
 *
 * Nothing here is computed by the LLM: buckets and scores are pure functions of already-resolved
 * timestamps, accepted goal links, item type, and confidence (see ./score.ts). The feed is fully
 * serializable so it crosses the server -> client boundary as plain JSON.
 */

/**
 * The temporal tier an entry lands in. This is what the UI groups by (never re-derive it client-side):
 *   overdue -> red, past due
 *   today   -> due / starting today
 *   soon    -> due within the next 7 days
 *   later   -> due beyond 7 days OR undated (open but no deadline)
 *   done    -> green, completed
 */
export type Bucket = "overdue" | "today" | "soon" | "later" | "done";

/** One accepted goal an entry advances, for the small goal chips on a card. */
export type GoalTag = { goalId: string; title: string };

/** An open action item related to a calendar event (deterministic title/label token overlap). */
export type MeetingTopic = { id: string; title: string; itemType: "task" | "follow_up" | "event" };

/**
 * One row on the Today surface. Either an accepted action item (origin 'item') or a real calendar
 * event in the next 7 days (origin 'calendar'). Every entry carries a working source chip payload
 * (hard rule #4) and its goal tags so importance is visible.
 */
export type AttentionEntry = {
  /** Item id, or `cal:<sourceId>` for a calendar event (kept distinct so ids never collide). */
  id: string;
  origin: "item" | "calendar";
  kind: "task" | "follow_up" | "event";
  title: string;
  /** The temporal tier (grouping + red/green tone come from BUCKET_META in ./score.ts). */
  bucket: Bucket;
  /** Deterministic importance score; higher = more important. Sorts entries within a bucket. */
  score: number;
  status: "accepted" | "done";
  /** Resolved deadline for items (ISO); null for calendar events and undated items. */
  dueAt: string | null;
  /** Start time for calendar events (ISO); null for items. */
  startsAt: string | null;
  /** End time for calendar events (ISO); null otherwise. */
  endsAt: string | null;
  /** True for all-day calendar events (they carry a date but no clock time). */
  allDay: boolean;
  reasoning: string | null;
  confidence: number | null;
  goalTags: GoalTag[];
  /** Populated only for calendar events: up to 3 open items that look related. */
  meetingTopics: MeetingTopic[];
  source: CardSource;
};

/** The whole Today surface in one serializable object. Buckets always present (possibly empty). */
export type AttentionFeed = {
  buckets: Record<Bucket, AttentionEntry[]>;
  /** ISO timestamp of the `now` the feed was scored against. */
  generatedAt: string;
};
