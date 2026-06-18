import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile, profileDigest } from "@/lib/profile";
import { loadGoalDigests } from "@/lib/goals/facts";
import { formatWhen, formatDate } from "@/lib/format";

/**
 * The bridge that lets the Jarvis assistant ANSWER QUESTIONS about the user's own connected data —
 * their Gmail, Google Calendar, meetings, tasks, contacts and opportunities — not just see them on a
 * dashboard. Everything here is read-only and RLS-scoped (the user-scoped Supabase client can only
 * ever touch the signed-in user's rows), so the assistant can reason over real data with no risk of
 * leaking another user's.
 *
 * Two capabilities are handed to `ask()`:
 *   • a compact DIGEST (buildDataDigest) injected into the system prompt — breadth at a glance, so
 *     "what's on my plate today?" answers immediately;
 *   • a SEARCH tool (searchMyData) the model can call to drill into specifics not in the digest
 *     ("what did Professor Lee email me about?").
 * Dates are only ever formatted here (display) — never computed by the model (hard rule #2).
 */

export type DataKind = "email" | "calendar" | "meeting" | "task" | "contact" | "opportunity";
export const DATA_KINDS: DataKind[] = ["email", "calendar", "meeting", "task", "contact", "opportunity"];

export type DataQuery = {
  keywords?: string;
  kinds?: DataKind[];
  when?: "today" | "upcoming" | "past" | "all";
  limit?: number;
};

export type DataSearchResult = { ok: boolean; text: string };

/** What the assistant route hands to ask(): a prose digest + a callable search over the user's data. */
export type AskDataContext = {
  dataDigest: string;
  searchData: (q: DataQuery) => Promise<DataSearchResult>;
};

const DAY_MS = 86_400_000;
const MAX_DIGEST = 7000;

function bounds() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { now, nowISO: now.toISOString(), startISO: start.toISOString(), endISO: end.toISOString() };
}

/** Strip characters that would break a PostgREST `.or()` filter; empty → no keyword filter. */
function sanitizeKeywords(raw?: string): string {
  return (raw ?? "").replace(/[,()*]/g, " ").trim().slice(0, 80);
}

function clip(s: string | null | undefined, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** Minimal structural view of a PostgREST filter builder — just the range filters we narrow on. */
interface RangeFilter<T> {
  gte(column: string, value: string): T;
  lte(column: string, value: string): T;
  lt(column: string, value: string): T;
}

/**
 * Apply a time window to a NON-nullable date column (e.g. sources.occurred_at, always set on ingest),
 * deterministically (no model-computed dates).
 */
function applyWindow<T extends RangeFilter<T>>(q: T, col: string, when: DataQuery["when"], b: ReturnType<typeof bounds>): T {
  if (when === "today") return q.gte(col, b.startISO).lte(col, b.endISO);
  if (when === "upcoming") return q.gte(col, b.nowISO);
  if (when === "past") return q.lt(col, b.nowISO);
  return q;
}

/**
 * The window for a NULLABLE date column (tasks.due_at, opportunities.deadline_at) as a PostgREST
 * or-string. A bare gte/lte comparison silently drops null-dated rows (SQL NULL ≠ true), which would
 * hide undated open tasks and rolling/unparsed-deadline opportunities — so today/upcoming KEEP nulls
 * (they're open, not gone). "past" excludes nulls (an undated item isn't in the past). Returns null
 * for "all"/undefined (no window). Timestamps are quoted so their ms dots don't confuse the parser.
 */
function nullableWindowOr(col: string, when: DataQuery["when"], b: ReturnType<typeof bounds>): string | null {
  if (when === "today") return `and(${col}.gte."${b.startISO}",${col}.lte."${b.endISO}"),${col}.is.null`;
  if (when === "upcoming") return `${col}.gte."${b.nowISO}",${col}.is.null`;
  if (when === "past") return `${col}.lt."${b.nowISO}"`;
  return null;
}

// ---------------------------------------------------------------------------
// Digest — the assistant's at-a-glance memory of the user's world.
// ---------------------------------------------------------------------------

type SourceRow = {
  title: string | null;
  from_name?: string | null;
  group_label?: string | null;
  permalink: string | null;
  occurred_at: string | null;
  raw_text: string | null;
};
type TaskRow = { title: string; due_at: string | null; status: string; reasoning: string | null };
type ContactRow = { full_name: string; company: string | null; role_title: string | null; follow_up_status: string | null; next_follow_up_at: string | null };
type OppRow = { title: string; organization: string | null; raw_deadline: string | null; deadline_at: string | null };

export async function buildDataDigest(supabase: SupabaseClient): Promise<string> {
  const b = bounds();
  const last14 = new Date(b.now.getTime() - 14 * DAY_MS).toISOString();

  const [profile, goals, events, tasks, emails, meetings, contacts, opps] = await Promise.all([
    loadProfile(supabase),
    loadGoalDigests(supabase),
    supabase
      .from("sources")
      .select("title, permalink, occurred_at, raw_text")
      .eq("source_type", "calendar")
      .gte("occurred_at", b.startISO)
      .order("occurred_at", { ascending: true })
      .limit(15),
    supabase
      .from("items")
      .select("title, due_at, status, reasoning")
      .in("item_type", ["task", "follow_up"])
      .eq("status", "accepted")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(25),
    supabase
      .from("sources")
      .select("title, from_name, group_label, permalink, occurred_at, raw_text")
      .eq("source_type", "email")
      .gte("occurred_at", last14)
      .order("occurred_at", { ascending: false })
      .limit(25),
    supabase
      .from("sources")
      .select("title, permalink, occurred_at, raw_text")
      .eq("source_type", "meeting")
      .order("occurred_at", { ascending: false })
      .limit(8),
    supabase
      .from("contacts")
      .select("full_name, company, role_title, follow_up_status, next_follow_up_at")
      .eq("review_status", "accepted")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("opportunities")
      .select("title, organization, raw_deadline, deadline_at")
      .eq("review_status", "accepted")
      .order("deadline_at", { ascending: true, nullsFirst: false })
      .limit(10),
  ]);

  const sections: string[] = [];
  const who = profileDigest(profile);
  if (who) sections.push(who);
  if (goals.length) sections.push(`The user's goals:\n${goals.map((g) => `- ${g.title}`).join("\n")}`);

  const evRows = (events.data ?? []) as SourceRow[];
  if (evRows.length) {
    sections.push(
      `Upcoming calendar events (from today):\n` +
        evRows
          .map((e) => `- ${formatWhen(e.occurred_at ?? undefined) || "(no time)"} — ${clip(e.title, 90) || "(untitled)"}${e.raw_text ? ` · ${clip(e.raw_text, 60)}` : ""}`)
          .join("\n"),
    );
  }

  const taskRows = (tasks.data ?? []) as TaskRow[];
  if (taskRows.length) {
    sections.push(
      `Open tasks (things the user has committed to):\n` +
        taskRows.map((t) => `- ${t.due_at ? `due ${formatDate(t.due_at)}` : "no due date"} — ${clip(t.title, 100)}`).join("\n"),
    );
  }

  const emailRows = (emails.data ?? []) as SourceRow[];
  if (emailRows.length) {
    const byGroup = new Map<string, SourceRow[]>();
    for (const e of emailRows) {
      const g = e.group_label ?? "Other";
      const arr = byGroup.get(g) ?? [];
      arr.push(e);
      byGroup.set(g, arr);
    }
    const lines = [...byGroup.entries()].map(
      ([g, rows]) => `- ${g}: ${rows.map((r) => clip(r.title, 60) || "(no subject)").slice(0, 4).join("; ")}`,
    );
    sections.push(`Recent important email (last 14 days, grouped by sender/org):\n${lines.join("\n")}`);
  }

  const meetRows = (meetings.data ?? []) as SourceRow[];
  if (meetRows.length) {
    sections.push(
      `Recent meetings:\n` + meetRows.map((m) => `- ${formatWhen(m.occurred_at ?? undefined) || "(no date)"} — ${clip(m.title, 90) || "(untitled)"}`).join("\n"),
    );
  }

  const contactRows = (contacts.data ?? []) as ContactRow[];
  if (contactRows.length) {
    sections.push(
      `Contacts being tracked:\n` +
        contactRows
          .map((c) => {
            const role = [c.role_title, c.company].filter(Boolean).join(" @ ");
            const fu = c.follow_up_status && c.follow_up_status !== "done" ? ` · follow-up: ${c.follow_up_status.replace(/_/g, " ")}` : "";
            return `- ${c.full_name}${role ? ` — ${role}` : ""}${fu}`;
          })
          .join("\n"),
    );
  }

  const oppRows = (opps.data ?? []) as OppRow[];
  if (oppRows.length) {
    sections.push(
      `Tracked opportunities:\n` +
        oppRows
          .map((o) => `- ${clip(o.title, 80)}${o.organization ? ` (${clip(o.organization, 40)})` : ""}${o.raw_deadline ? ` — deadline: ${clip(o.raw_deadline, 40)}` : ""}`)
          .join("\n"),
    );
  }

  if (!sections.length) {
    return "The user has not connected Google or added any tasks/contacts/opportunities yet, so there is no personal data to draw on. If they ask about their email, calendar, meetings or tasks, tell them to connect Google on the Connections page and sync, or add items manually.";
  }
  return sections.join("\n\n").slice(0, MAX_DIGEST);
}

// ---------------------------------------------------------------------------
// Search tool — let the model drill into specifics on demand.
// ---------------------------------------------------------------------------

export async function searchMyData(supabase: SupabaseClient, q: DataQuery): Promise<DataSearchResult> {
  const kinds = q.kinds && q.kinds.length ? q.kinds.filter((k) => DATA_KINDS.includes(k)) : DATA_KINDS;
  const kw = sanitizeKeywords(q.keywords);
  const when = q.when ?? "all";
  const perKind = Math.max(3, Math.min(q.limit ?? 12, 25));
  const b = bounds();
  const out: string[] = [];

  // Sources: email / calendar / meeting (occurred_at drives the time window).
  for (const sk of kinds.filter((k) => k === "email" || k === "calendar" || k === "meeting")) {
    let query = supabase
      .from("sources")
      .select("title, from_name, from_email, group_label, permalink, occurred_at, raw_text")
      .eq("source_type", sk);
    query = applyWindow(query, "occurred_at", when, b);
    if (kw) query = query.or(`title.ilike.%${kw}%,raw_text.ilike.%${kw}%,from_name.ilike.%${kw}%,from_email.ilike.%${kw}%,group_label.ilike.%${kw}%`);
    const { data } = await query.order("occurred_at", { ascending: when === "upcoming" }).limit(perKind);
    const rows = (data ?? []) as (SourceRow & { from_email?: string | null })[];
    if (rows.length) {
      const label = sk === "email" ? "Emails" : sk === "calendar" ? "Calendar events" : "Meetings";
      out.push(
        `${label}:\n` +
          rows
            .map((r) => {
              const from = sk === "email" && r.from_name ? ` — from ${r.from_name}` : "";
              const body = r.raw_text ? ` · ${clip(r.raw_text, 100)}` : "";
              const link = r.permalink ? ` [${r.permalink}]` : "";
              return `- ${formatWhen(r.occurred_at ?? undefined) || "(no date)"} — ${clip(r.title, 90) || "(untitled)"}${from}${body}${link}`;
            })
            .join("\n"),
      );
    }
  }

  if (kinds.includes("task")) {
    let query = supabase.from("items").select("title, due_at, status, reasoning").in("item_type", ["task", "follow_up"]).eq("status", "accepted");
    const win = nullableWindowOr("due_at", when, b);
    if (win) query = query.or(win); // keeps undated open tasks in today/upcoming
    if (kw) query = query.or(`title.ilike.%${kw}%,reasoning.ilike.%${kw}%`);
    const { data } = await query.order("due_at", { ascending: true, nullsFirst: false }).limit(perKind);
    const rows = (data ?? []) as TaskRow[];
    if (rows.length) {
      out.push(`Tasks:\n` + rows.map((t) => `- ${t.due_at ? `due ${formatDate(t.due_at)}` : "no due date"} — ${clip(t.title, 100)}${t.reasoning ? ` (${clip(t.reasoning, 60)})` : ""}`).join("\n"));
    }
  }

  if (kinds.includes("contact")) {
    let query = supabase.from("contacts").select("full_name, company, role_title, background, relevance, follow_up_status").eq("review_status", "accepted");
    if (kw) query = query.or(`full_name.ilike.%${kw}%,company.ilike.%${kw}%,role_title.ilike.%${kw}%,background.ilike.%${kw}%,relevance.ilike.%${kw}%`);
    const { data } = await query.order("created_at", { ascending: false }).limit(perKind);
    const rows = (data ?? []) as (ContactRow & { background?: string | null; relevance?: string | null })[];
    if (rows.length) {
      out.push(
        `Contacts:\n` +
          rows
            .map((c) => {
              const role = [c.role_title, c.company].filter(Boolean).join(" @ ");
              return `- ${c.full_name}${role ? ` — ${role}` : ""}${c.relevance ? ` · ${clip(c.relevance, 80)}` : ""}`;
            })
            .join("\n"),
      );
    }
  }

  if (kinds.includes("opportunity")) {
    let query = supabase.from("opportunities").select("title, organization, description, raw_deadline, deadline_at, how_to_apply_url").eq("review_status", "accepted");
    const win = nullableWindowOr("deadline_at", when, b);
    if (win) query = query.or(win); // keeps rolling / unparsed-deadline opps in today/upcoming
    if (kw) query = query.or(`title.ilike.%${kw}%,organization.ilike.%${kw}%,description.ilike.%${kw}%`);
    const { data } = await query.order("deadline_at", { ascending: true, nullsFirst: false }).limit(perKind);
    const rows = (data ?? []) as (OppRow & { description?: string | null; how_to_apply_url?: string | null })[];
    if (rows.length) {
      out.push(
        `Opportunities:\n` +
          rows
            .map((o) => `- ${clip(o.title, 80)}${o.organization ? ` (${clip(o.organization, 40)})` : ""}${o.raw_deadline ? ` — deadline: ${clip(o.raw_deadline, 40)}` : ""}${o.how_to_apply_url ? ` [${o.how_to_apply_url}]` : ""}`)
            .join("\n"),
      );
    }
  }

  if (!out.length) {
    return { ok: true, text: `No matching items found in the user's connected data${kw ? ` for "${kw}"` : ""}. They may need to connect Google and sync, or the item simply isn't there.` };
  }
  return { ok: true, text: out.join("\n\n").slice(0, 6000) };
}

/** Bundle the digest + search closure for ask(). One call per assistant request. */
export async function buildAskDataContext(supabase: SupabaseClient): Promise<AskDataContext> {
  const dataDigest = await buildDataDigest(supabase);
  return { dataDigest, searchData: (query: DataQuery) => searchMyData(supabase, query) };
}
