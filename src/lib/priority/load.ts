import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardSource, SourceType } from "@/lib/types";
import { calendarLocation } from "@/lib/format";
import { goalsForEntities } from "@/lib/goals/load";
import { scoreItem } from "@/lib/priority/score";
import type { AttentionEntry, AttentionFeed, Bucket, GoalTag, MeetingTopic } from "@/lib/priority/types";

/**
 * The Today "attention" loader: merges the user's accepted action items with their upcoming calendar
 * events, scores each deterministically (./score.ts, NO LLM), and returns one bucketed, serializable
 * feed. Every read goes through the per-request `supabase` client, so RLS scopes everything to the
 * signed-in user. Every entry carries a working source chip (hard rule #4).
 */

const DAY_MS = 86_400_000;

const KNOWN_SOURCE_TYPES: SourceType[] = ["email", "meeting", "calendar", "manual", "research", "notion"];
function toSourceType(s: string | null | undefined): SourceType {
  return KNOWN_SOURCE_TYPES.includes((s ?? "") as SourceType) ? (s as SourceType) : "manual";
}

function coerceKind(s: string | null | undefined): "task" | "follow_up" | "event" {
  return s === "follow_up" || s === "event" ? s : "task";
}

// Generic, low-signal words we don't want driving a "meeting topic" match.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "our", "meeting", "call", "sync", "chat", "catch",
  "weekly", "daily", "standup", "check", "checkin", "review", "quick", "team", "session", "invite",
]);

/** Normalized content tokens (>= 3 chars, no stopwords) for deterministic overlap matching. */
function tokens(s: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const t of (s ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length >= 3 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

type SrcJoin = {
  source_type: string | null;
  title: string | null;
  permalink: string | null;
  occurred_at: string | null;
  raw_text: string | null;
  group_label: string | null;
};

type ItemRow = {
  id: string;
  item_type: string;
  title: string;
  due_at: string | null;
  status: string;
  confidence: number | null;
  source_quote: string | null;
  reasoning: string | null;
  source_id: string | null;
  sources: SrcJoin | SrcJoin[] | null;
};

type CalRow = {
  id: string;
  title: string | null;
  permalink: string | null;
  occurred_at: string | null;
  ends_at: string | null;
  is_all_day: boolean | null;
  raw_text: string | null;
};

function toGoalTags(list: { id: string; title: string }[] | undefined): GoalTag[] {
  return (list ?? []).map((g) => ({ goalId: g.id, title: g.title }));
}

export async function loadAttention(supabase: SupabaseClient, now: Date): Promise<AttentionFeed> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startISO = startOfToday.toISOString();
  // Today through the end of the 7th day ahead (8 local days of calendar).
  const endWindowISO = new Date(startOfToday.getTime() + 8 * DAY_MS).toISOString();

  const [itemsRes, calRes] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, item_type, title, due_at, status, confidence, source_quote, reasoning, source_id, sources(source_type, title, permalink, occurred_at, raw_text, group_label)",
      )
      .in("status", ["accepted", "done"])
      .in("item_type", ["task", "follow_up", "event"])
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from("sources")
      .select("id, title, permalink, occurred_at, ends_at, is_all_day, raw_text")
      .eq("source_type", "calendar")
      .gte("occurred_at", startISO)
      .lt("occurred_at", endWindowISO)
      .order("occurred_at", { ascending: true })
      .limit(50),
  ]);

  const itemRows = (itemsRes.data ?? []) as ItemRow[];
  const calRows = (calRes.data ?? []) as CalRow[];

  // Accepted goal links for the items and the calendar sources (entity_type 'item' / 'source').
  const itemIds = itemRows.map((r) => r.id);
  const calIds = calRows.map((c) => c.id);
  const [itemGoals, sourceGoals] = await Promise.all([
    goalsForEntities(supabase, "item", itemIds),
    goalsForEntities(supabase, "source", calIds),
  ]);

  // ---- Item entries (task / follow_up / event) -----------------------------
  const itemEntries: AttentionEntry[] = [];
  // Open (accepted, not done) items are candidate "meeting topics" for calendar events.
  const topicCandidates: { tokens: Set<string>; entry: AttentionEntry }[] = [];

  for (const r of itemRows) {
    const src = Array.isArray(r.sources) ? r.sources[0] : r.sources;
    const title = (r.title ?? "").trim();
    // A quoteless item (e.g. a manually added task) still needs a source chip: fall back to its own
    // title as the quote so the Card invariant (hard rule #4) holds. Same pattern the old plan used.
    const quote = (r.source_quote ?? "").trim() || title;
    if (!quote) continue;

    const kind = coerceKind(r.item_type);
    const status: "accepted" | "done" = r.status === "done" ? "done" : "accepted";
    const goalTags = toGoalTags(itemGoals.get(r.id));
    const confidence = typeof r.confidence === "number" ? r.confidence : null;

    const { score, bucket } = scoreItem(
      { kind, dueAt: r.due_at, status, goalCount: goalTags.length, confidence },
      now,
    );

    const source: CardSource = {
      type: toSourceType(src?.source_type ?? "manual"),
      quote,
      title: src?.title ?? undefined,
      permalink: src?.permalink ?? undefined,
      occurredAt: src?.occurred_at ?? undefined,
      rawText: src?.raw_text ?? undefined,
      confidence: confidence ?? undefined,
    };

    const entry: AttentionEntry = {
      id: r.id,
      origin: "item",
      kind,
      title: title || "(untitled)",
      bucket,
      score,
      status,
      dueAt: r.due_at,
      startsAt: null,
      endsAt: null,
      allDay: false,
      reasoning: r.reasoning,
      confidence,
      goalTags,
      meetingTopics: [],
      source,
    };
    itemEntries.push(entry);

    if (status === "accepted") {
      const tokset = tokens(title);
      for (const t of tokens(src?.group_label)) tokset.add(t);
      topicCandidates.push({ tokens: tokset, entry });
    }
  }

  // ---- Calendar event entries (today + next 7 days) ------------------------
  const calEntries: AttentionEntry[] = [];
  for (const c of calRows) {
    const title = (c.title ?? "").trim() || "(untitled event)";
    const loc = calendarLocation(c.raw_text);
    const quote = loc ? `${title}, ${loc}` : title;
    const allDay = c.is_all_day ?? false;
    const goalTags = toGoalTags(sourceGoals.get(c.id));

    const { score, bucket } = scoreItem(
      { kind: "event", dueAt: null, startsAt: c.occurred_at, status: "accepted", goalCount: goalTags.length, confidence: null },
      now,
      allDay,
    );

    const evTokens = tokens(title);
    const meetingTopics: MeetingTopic[] = evTokens.size
      ? topicCandidates
          .map((cand) => ({ n: overlap(evTokens, cand.tokens), cand }))
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n || b.cand.entry.score - a.cand.entry.score)
          .slice(0, 3)
          .map((x) => ({ id: x.cand.entry.id, title: x.cand.entry.title, itemType: x.cand.entry.kind }))
      : [];

    calEntries.push({
      id: `cal:${c.id}`,
      origin: "calendar",
      kind: "event",
      title,
      bucket,
      score,
      status: "accepted",
      dueAt: null,
      startsAt: c.occurred_at,
      endsAt: c.ends_at,
      allDay,
      reasoning: null,
      confidence: null,
      goalTags,
      meetingTopics,
      source: {
        type: "calendar",
        quote,
        title,
        permalink: c.permalink ?? undefined,
        occurredAt: c.occurred_at ?? undefined,
      },
    });
  }

  // ---- Bucket + sort (importance within each tier, stable by title) --------
  const buckets: Record<Bucket, AttentionEntry[]> = { overdue: [], today: [], soon: [], later: [], done: [] };
  for (const e of [...itemEntries, ...calEntries]) buckets[e.bucket].push(e);
  for (const key of Object.keys(buckets) as Bucket[]) {
    buckets[key].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  return { buckets, generatedAt: now.toISOString() };
}
