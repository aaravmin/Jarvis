import "server-only";
import { geminiStructured } from "@/lib/llm/gemini";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardSource, SourceType } from "@/lib/types";
import { formatWhen, formatEventTime, calendarLocation } from "@/lib/format";
import { loadProfile, profileDigest } from "@/lib/profile";

/**
 * The "Today" agent, builds a prioritized, time-ordered plan for the day from the user's real
 * calendar events, open tasks, and recent emails. What to do first; what matters most.
 *
 * Hard rule #2 is sacred here: the model NEVER computes or emits a clock time or date. Fixed calendar
 * events keep the real start time we pass in (from sources.occurred_at); the model only SEQUENCES the
 * flexible tasks/emails around them and tags each with a coarse part-of-day. Our deterministic code
 * then derives the sort order and the displayed time, the model's output is ordering + prose only.
 *
 * The plan is ephemeral (a view, never persisted) so it stays L0/suggest-only: nothing is created.
 * Every block still carries a working source (hard rule #4) so the Today UI can render it in a <Card>.
 */

const MAX_TOKENS = 3000;
const DAY_MS = 86_400_000;

export type PlanPriority = "high" | "medium" | "low";
export type PartOfDay = "morning" | "afternoon" | "evening" | "anytime";

/** One row in the rendered timeline. Fully serializable for the API → client boundary. */
export type PlanBlock = {
  ref: string;
  kind: "event" | "task" | "email";
  title: string;
  action: string;
  why?: string;
  priority: PlanPriority;
  /** Display time: a real clock time for fixed events, or a part-of-day label for flexible items. */
  timeLabel: string;
  fixed: boolean;
  source: CardSource;
};

export type DayPlan = { date: string; summary: string; blocks: PlanBlock[] };

// Internal: an item fed to the model, with everything we need to render it after.
type PlanItem = {
  ref: string;
  kind: "event" | "task" | "email";
  title: string;
  fixed: boolean;
  whenISO?: string; // events: real start time (drives sort + display)
  allDay?: boolean; // all-day events have no clock time, display a date / "All day", never a time
  context: string; // line shown to the model
  source: CardSource;
};

const SOURCE_TYPES: SourceType[] = ["email", "meeting", "calendar", "manual", "research"];
function toSourceType(s: string | null | undefined): SourceType {
  return SOURCE_TYPES.includes((s ?? "") as SourceType) ? (s as SourceType) : "manual";
}

function clip(s: string | null | undefined, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Load today's raw material (deterministic, real times come from the data).
// ---------------------------------------------------------------------------

type CalRow = { id: string; title: string | null; permalink: string | null; occurred_at: string | null; ends_at: string | null; is_all_day: boolean | null; raw_text: string | null };
type TaskRow = { id: string; title: string; due_at: string | null; reasoning: string | null; source_id: string | null; source_quote: string | null };
type EmailRow = { id: string; title: string | null; from_name: string | null; permalink: string | null; occurred_at: string | null; raw_text: string | null };
type SourceLite = { id: string; source_type: string | null; title: string | null; permalink: string | null; occurred_at: string | null };

async function loadTodayItems(supabase: SupabaseClient): Promise<PlanItem[]> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const recentISO = new Date(now.getTime() - 2 * DAY_MS).toISOString();

  const [events, tasks, emails] = await Promise.all([
    supabase
      .from("sources")
      .select("id, title, permalink, occurred_at, ends_at, is_all_day, raw_text")
      .eq("source_type", "calendar")
      .gte("occurred_at", startISO)
      .lte("occurred_at", endISO)
      .order("occurred_at", { ascending: true })
      .limit(20),
    supabase
      .from("items")
      .select("id, title, due_at, reasoning, source_id, source_quote")
      .in("item_type", ["task", "follow_up"])
      .eq("status", "accepted")
      // Today + overdue, plus undated open commitments. Quote the timestamp so the ms dots in the ISO
      // string can't confuse PostgREST's or-filter parser.
      .or(`due_at.lte."${endISO}",due_at.is.null`)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(20),
    supabase
      .from("sources")
      .select("id, title, from_name, permalink, occurred_at, raw_text")
      .eq("source_type", "email")
      .gte("occurred_at", recentISO)
      .order("occurred_at", { ascending: false })
      .limit(8),
  ]);

  const items: PlanItem[] = [];

  const evRows = (events.data ?? []) as CalRow[];
  evRows.forEach((e, i) => {
    const title = clip(e.title, 120) || "(untitled event)";
    const detail = clip(calendarLocation(e.raw_text), 80);
    const allDay = e.is_all_day ?? false;
    items.push({
      ref: `e${i}`,
      kind: "event",
      title,
      fixed: true,
      whenISO: e.occurred_at ?? undefined,
      allDay,
      context: `[e${i}] ${formatEventTime(e.occurred_at ?? undefined, e.ends_at ?? undefined, allDay) || "(no time)"}, ${title}${detail ? ` (${detail})` : ""}`,
      source: {
        type: "calendar",
        quote: `${title}${detail ? `, ${detail}` : ""}`,
        title,
        permalink: e.permalink ?? undefined,
        occurredAt: e.occurred_at ?? undefined,
      },
    });
  });

  // Resolve each task's backing source (for the provenance chip), in one batched query.
  const taskRows = (tasks.data ?? []) as TaskRow[];
  const srcIds = [...new Set(taskRows.map((t) => t.source_id).filter((x): x is string => Boolean(x)))];
  const srcById = new Map<string, SourceLite>();
  if (srcIds.length) {
    const { data: srcs } = await supabase.from("sources").select("id, source_type, title, permalink, occurred_at").in("id", srcIds);
    for (const s of (srcs ?? []) as SourceLite[]) srcById.set(s.id, s);
  }
  taskRows.forEach((t, i) => {
    const title = clip(t.title, 120) || "(untitled task)";
    const overdue = t.due_at ? new Date(t.due_at).getTime() < start.getTime() : false;
    const due = t.due_at ? (overdue ? "overdue" : "due today") : "no due date";
    const src = t.source_id ? srcById.get(t.source_id) : undefined;
    items.push({
      ref: `t${i}`,
      kind: "task",
      title,
      fixed: false,
      context: `[t${i}] (${due}) ${title}${t.reasoning ? `, ${clip(t.reasoning, 70)}` : ""}`,
      source: {
        type: toSourceType(src?.source_type),
        quote: (t.source_quote && t.source_quote.trim()) || title,
        title: src?.title ?? undefined,
        permalink: src?.permalink ?? undefined,
        occurredAt: src?.occurred_at ?? undefined,
      },
    });
  });

  const emailRows = (emails.data ?? []) as EmailRow[];
  emailRows.forEach((e, i) => {
    const subject = clip(e.title, 120) || "(no subject)";
    const snippet = clip(e.raw_text, 100);
    items.push({
      ref: `m${i}`,
      kind: "email",
      title: subject,
      fixed: false,
      context: `[m${i}] from ${e.from_name ?? "unknown"}, "${subject}"${snippet ? ` (${snippet})` : ""}`,
      source: {
        type: "email",
        quote: `${subject}${snippet ? `, ${snippet}` : ""}`,
        title: subject,
        permalink: e.permalink ?? undefined,
        occurredAt: e.occurred_at ?? undefined,
      },
    });
  });

  return items;
}

// ---------------------------------------------------------------------------
// The forced-tool plan call (ordering + prose only, no dates).
// ---------------------------------------------------------------------------

const PLAN_TOOL = {
  name: "build_day_plan",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      summary: { type: "string", description: "1-2 sentences: the shape of the day and the single most important thing." },
      blocks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ref: { type: "string", description: "The [ref] of the item, e.g. 'e0', 't1', 'm0'." },
            order: { type: "number", description: "1-based position in the day's sequence (what to do first = 1)." },
            part_of_day: {
              type: "string",
              enum: ["morning", "afternoon", "evening", "anytime"],
              description: "For flexible tasks/emails: when in the day to do it. For fixed events: the part of day matching their real time.",
            },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            action: { type: "string", description: "Imperative one-liner, what to do (e.g. 'Prep two questions for the interview')." },
            why: { type: "string", description: "Short reason it sits here / why it matters today." },
          },
          required: ["ref", "order", "priority", "action"],
        },
      },
    },
    required: ["summary", "blocks"],
  },
};

type RawBlock = { ref?: string; order?: number; part_of_day?: string; priority?: string; action?: string; why?: string };

function bucketHour(part: PartOfDay): number {
  return part === "morning" ? 9 : part === "afternoon" ? 13 : part === "evening" ? 18 : 12;
}

function normPriority(p: string | undefined): PlanPriority {
  return p === "high" || p === "low" ? p : "medium";
}
function normPart(p: string | undefined): PartOfDay {
  return p === "morning" || p === "afternoon" || p === "evening" ? p : "anytime";
}

export async function buildDayPlan(supabase: SupabaseClient): Promise<DayPlan> {
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const items = await loadTodayItems(supabase);
  if (!items.length) {
    return { date: dateLabel, summary: "", blocks: [] };
  }

  const byRef = new Map(items.map((it) => [it.ref, it]));
  const events = items.filter((i) => i.kind === "event");
  const tasks = items.filter((i) => i.kind === "task");
  const emails = items.filter((i) => i.kind === "email");

  const profile = await loadProfile(supabase);
  const who = profileDigest(profile);

  const sections: string[] = [];
  if (events.length) sections.push(`FIXED CALENDAR EVENTS (already scheduled at the given time, keep them at that time, never restate a new time; an event shown with a DATE only is all-day, so don't give it a clock time):\n${events.map((e) => e.context).join("\n")}`);
  if (tasks.length) sections.push(`TASKS (flexible, assign a part of day and an order, never a clock time):\n${tasks.map((t) => t.context).join("\n")}`);
  if (emails.length) sections.push(`RECENT EMAILS THAT MAY NEED ACTION (flexible; include only the ones that warrant action today):\n${emails.map((m) => m.context).join("\n")}`);

  const userMsg = `${who ? `${who}\n\n` : ""}Here is everything on the user's plate for today:\n\n${sections.join("\n\n")}\n\nBuild the user's plan for today via the build_day_plan tool. Sequence the items sensibly: schedule flexible work around the fixed events, decide what to do first, and surface what matters most. Reference each item you include by its [ref].`;

  const system = `You are Jarvis, building the user's plan for TODAY. Produce a focused, realistic, prioritized day.

CRITICAL RULES:
- Never invent or compute clock times or dates. Fixed calendar events already have their real time, do not change it or restate a new one. For flexible tasks/emails, only choose a part of day (morning/afternoon/evening/anytime) and an order, never a specific time.
- Use only the items given. Do not invent meetings, tasks, or emails. Reference each by its [ref].
- Put high-stakes and time-sensitive things first; protect time before fixed events for anything that needs prep. Overdue tasks are high priority.
- Be concise. Drop pure noise (e.g. newsletters) rather than padding the plan.`;

  const parsed = await geminiStructured<{ summary?: string; blocks?: RawBlock[] }>({
    system,
    user: userMsg,
    schema: PLAN_TOOL.input_schema,
    maxTokens: MAX_TOKENS,
  });

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();

  const seen = new Set<string>();
  const built: (PlanBlock & { sortKey: number })[] = [];
  for (const rb of parsed?.blocks ?? []) {
    const ref = (rb.ref ?? "").trim();
    const it = byRef.get(ref);
    if (!it || seen.has(ref)) continue;
    seen.add(ref);
    const part = normPart(rb.part_of_day);
    const order = typeof rb.order === "number" && Number.isFinite(rb.order) ? rb.order : built.length + 1;
    const sortKey = it.fixed && it.whenISO ? new Date(it.whenISO).getTime() : startMs + bucketHour(part) * 3_600_000 + order * 60_000;
    built.push({
      ref,
      kind: it.kind,
      title: it.title,
      action: (rb.action ?? "").trim() || it.title,
      why: (rb.why ?? "").trim() || undefined,
      priority: normPriority(rb.priority),
      timeLabel: it.fixed ? (it.allDay ? "All day" : it.whenISO ? formatWhen(it.whenISO) : capitalize(part)) : capitalize(part),
      fixed: it.fixed,
      source: it.source,
      sortKey,
    });
  }

  // Fallback: if the model returned nothing usable, lay items out deterministically so the day is
  // never blank, events at their real time, then tasks, then emails.
  if (!built.length) {
    items.forEach((it, idx) => {
      const sortKey = it.fixed && it.whenISO ? new Date(it.whenISO).getTime() : startMs + bucketHour("anytime") * 3_600_000 + idx * 60_000;
      built.push({
        ref: it.ref,
        kind: it.kind,
        title: it.title,
        action: it.kind === "email" ? `Review and reply: ${it.title}` : it.title,
        why: undefined,
        priority: it.kind === "event" ? "high" : "medium",
        timeLabel: it.fixed ? (it.allDay ? "All day" : it.whenISO ? formatWhen(it.whenISO) : "Anytime") : "Anytime",
        fixed: it.fixed,
        source: it.source,
        sortKey,
      });
    });
  }

  built.sort((a, b) => a.sortKey - b.sortKey);
  const blocks: PlanBlock[] = built.map((b) => ({
    ref: b.ref,
    kind: b.kind,
    title: b.title,
    action: b.action,
    why: b.why,
    priority: b.priority,
    timeLabel: b.timeLabel,
    fixed: b.fixed,
    source: b.source,
  }));
  return {
    date: dateLabel,
    summary: (parsed?.summary ?? "").trim() || "Here's your plan for today.",
    blocks,
  };
}
