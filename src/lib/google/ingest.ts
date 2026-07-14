import "server-only";
import { geminiStructured } from "@/lib/llm/gemini";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken, getConnection } from "@/lib/google/store";
import { listMessageIds, getMessage, getThreadState, gmailLink, type GmailMessage } from "@/lib/google/gmail";
import { listEvents } from "@/lib/google/calendar";
import { loadGoalDigests } from "@/lib/goals/facts";
import { loadProfile, profileDigest } from "@/lib/profile";
import { extractItemsFromSources } from "@/lib/google/extract-items";

/**
 * Gmail + Calendar ingestion. Gmail is triaged relative to the user's goals/profile: only genuinely
 * important mail is kept (spam/promotions/noise dropped entirely), grouped by sender/org. Calendar is
 * kept as-is (no filtering). Everything is stored as `sources` (the provenance anchor), deduped by id.
 */

type Classification = { idx: number; keep: boolean; category: string; group: string };

const CLASSIFY_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          idx: { type: "number" },
          keep: { type: "boolean" },
          category: { type: "string", enum: ["opportunity", "person", "update", "other"] },
          group: { type: "string" },
        },
        required: ["idx", "keep", "group"],
      },
    },
  },
  required: ["items"],
};

async function relevance(supabase: SupabaseClient): Promise<string> {
  const [profile, goals] = await Promise.all([loadProfile(supabase), loadGoalDigests(supabase)]);
  const parts = [profileDigest(profile)];
  // Include descriptions: a sub-goal's specificity ("expand criminal-justice member attendance")
  // lives there, and it is exactly what makes goal-relevant correspondence stand out in triage.
  if (goals.length)
    parts.push(`Goals:\n${goals.map((g) => `- ${g.title}${g.description ? `: ${g.description}` : ""}`).join("\n")}`);
  return parts.filter(Boolean).join("\n\n");
}

async function classifyEmails(emails: GmailMessage[], who: string): Promise<Map<number, Classification>> {
  const list = emails
    .map((e, i) => `[${i}] from: ${e.fromName} <${e.fromEmail}> | subject: ${e.subject} | ${e.snippet.slice(0, 160)}`)
    .join("\n");

  const out = await geminiStructured<{ items?: Record<string, unknown>[] }>({
    system: `You triage a person's inbox. KEEP only genuinely important emails; DROP promotions, marketing, newsletters, social notifications, automated noise, and spam (keep=false for those). For kept emails, GROUP by the sender's organization or person (e.g. "Brown University", "Jane Smith", "YC"). Judge importance relative to the user below.${who ? `\n\n${who}` : ""}`,
    user: `Triage these inbox emails:\n${list}`,
    schema: CLASSIFY_SCHEMA,
    maxTokens: 4000,
  });

  const items = (out?.items ?? []) as Record<string, unknown>[];
  const map = new Map<number, Classification>();
  for (const it of items) {
    const idx = Number(it.idx);
    if (!Number.isInteger(idx)) continue;
    map.set(idx, {
      idx,
      keep: it.keep !== false,
      category: String(it.category ?? "other"),
      group: String(it.group ?? "").trim() || "Other",
    });
  }
  return map;
}

const DAY_MS = 86_400_000;
const CURSOR_OVERLAP_MS = 60 * 60 * 1000; // 1h re-fetch window so a message racing the last sync isn't skipped
const COLD_FETCH = 40; // first-ever sync: today's behavior (newest 40)
const CURSOR_FETCH_CAP = 100; // incremental sync: pull up to 100 newer-than-cursor messages
const THREAD_LOOKBACK_DAYS = 21; // only refresh reply-state for threads that are still fresh
const THREAD_CAP = 40; // cap thread metadata lookups per sync (429-friendly, newest first)
const UNDEFINED_COLUMN = "42703"; // Postgres "undefined column" — migration 0024 not applied yet
const APPLY_0024_NOTE =
  "Apply migration 0024_thread_state.sql in the Supabase SQL editor to turn on reply tracking (Needs reply / Waiting on them).";

export type GmailIngestResult = {
  imported: number;
  /** = itemsKept. Retained for existing consumers (SyncButton fallback, Notion card copy). */
  itemsExtracted: number;
  /** Candidates the extractor proposed across the new mail (before the citation gate / dedup). */
  candidatesFound: number;
  /** Candidates that survived and landed in the Review queue. */
  itemsKept: number;
  /** Threads whose reply-state we re-read from Gmail this sync. */
  threadsResolved: number;
  /** Open follow-ups auto-closed because the user has now replied on that thread. */
  followUpsClosed: number;
  groups: { label: string; count: number }[];
  /** Set when the reply-state columns are missing (migration 0024 pending); the app still works. */
  degradeNote?: string;
};

export async function ingestGmail(supabase: SupabaseClient, userId: string): Promise<GmailIngestResult> {
  const token = await getValidAccessToken(supabase, userId);

  // Cursor: only pull mail newer than the newest email we already stored (minus a 1h overlap). On the
  // first-ever sync (no email sources) fall back to today's behavior: the newest 40.
  const { data: newestRow } = await supabase
    .from("sources")
    .select("occurred_at")
    .eq("user_id", userId)
    .eq("source_type", "email")
    .not("occurred_at", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cursorMs = newestRow?.occurred_at ? new Date(newestRow.occurred_at as string).getTime() : null;
  const afterEpochSec = cursorMs ? (cursorMs - CURSOR_OVERLAP_MS) / 1000 : undefined;
  const ids = await listMessageIds(token, afterEpochSec ? CURSOR_FETCH_CAP : COLD_FETCH, afterEpochSec);

  // Existing email external ids → skip duplicates BEFORE we spend an LLM classification call on them.
  // Only genuinely-new messages are ever classified/extracted (never re-classify what we already kept).
  const { data: existing } = await supabase
    .from("sources")
    .select("external_id")
    .eq("user_id", userId)
    .eq("source_type", "email")
    .not("external_id", "is", null);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));
  const newIds = ids.filter((m) => !seen.has(m.id));

  let degradeNote: string | undefined;
  let threadColsOk = true; // flips false the first time an insert hits 42703 (columns not migrated yet)

  const groups = new Map<string, number>();
  let imported = 0;
  let candidatesFound = 0;
  let itemsKept = 0;
  // Newly-stored email sources whose body we'll mine for action items after the ingest loop.
  const newSources: { id: string; title: string | null; body: string; occurredAt: string | null }[] = [];

  if (newIds.length) {
    const emails = (await Promise.all(newIds.map((m) => getMessage(token, m.id).catch(() => null)))).filter(
      (e): e is GmailMessage => e !== null,
    );

    const who = await relevance(supabase);
    const cls = await classifyEmails(emails, who);

    for (let i = 0; i < emails.length; i++) {
      const e = emails[i];
      const c = cls.get(i);
      if (!c || !c.keep) continue;

      const base = {
        user_id: userId,
        source_type: "email",
        external_id: e.id,
        title: e.subject,
        from_name: e.fromName,
        from_email: e.fromEmail,
        group_label: c.group,
        permalink: gmailLink(e.id),
        occurred_at: e.dateISO,
        raw_text: e.body || e.snippet,
      };
      const withThread: Record<string, unknown> = { ...base, thread_id: e.threadId };
      let res = await supabase.from("sources").insert(threadColsOk ? withThread : base).select("id").single();
      if (res.error?.code === UNDEFINED_COLUMN && threadColsOk) {
        // Migration 0024 not applied: drop the reply-state column and keep ingesting as normal.
        threadColsOk = false;
        degradeNote = APPLY_0024_NOTE;
        res = await supabase.from("sources").insert(base).select("id").single();
      }
      if (res.error || !res.data) continue; // skip on insert failure (e.g. a dedup race), don't count it
      imported++;
      newSources.push({ id: res.data.id, title: e.subject, body: e.body || e.snippet, occurredAt: e.dateISO });
      groups.set(c.group, (groups.get(c.group) ?? 0) + 1);
    }

    // Mine the freshly-stored emails for action items (L0 → they land in the Review queue, suggest-only).
    // Best-effort: extraction failures must not fail the ingest that already succeeded.
    if (newSources.length) {
      try {
        const r = await extractItemsFromSources(supabase, userId, newSources);
        candidatesFound = r.considered;
        itemsKept = r.inserted;
      } catch {
        candidatesFound = 0;
        itemsKept = 0;
      }
    }
  }

  // Refresh reply-state for recent OPEN threads and self-heal follow-ups the user has since answered.
  // Runs even when there was no new mail (a reply you sent from Gmail still needs to clear its item).
  let threadsResolved = 0;
  let followUpsClosed = 0;
  if (threadColsOk) {
    const refreshed = await refreshThreadStates(supabase, userId, token);
    threadsResolved = refreshed.threadsResolved;
    followUpsClosed = refreshed.followUpsClosed;
    if (refreshed.degradeNote) degradeNote = refreshed.degradeNote;
  }

  return {
    imported,
    itemsExtracted: itemsKept,
    candidatesFound,
    itemsKept,
    threadsResolved,
    followUpsClosed,
    groups: [...groups.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    degradeNote,
  };
}

/**
 * Re-read reply-state for the user's recent email threads and settle any follow-up they have answered.
 *
 * DETERMINISTIC (hard rule #7): whether the user replied is read from the real Gmail thread, never the
 * model. For each fresh thread we record who sent the newest message (last_msg_from) and when
 * (last_msg_at). When that newest message is now from the user, every open follow-up we tracked on that
 * thread is settled: accepted ones become 'done', still-in-review ones become 'dismissed'. That is a
 * fact (the user replied), so it does not violate L0. 42703-tolerant: if the columns are not migrated
 * yet it returns a degrade note and does nothing.
 */
async function refreshThreadStates(
  supabase: SupabaseClient,
  userId: string,
  token: string,
): Promise<{ threadsResolved: number; followUpsClosed: number; degradeNote?: string }> {
  const since = new Date(Date.now() - THREAD_LOOKBACK_DAYS * DAY_MS).toISOString();
  const { data: rows, error } = await supabase
    .from("sources")
    .select("id, thread_id")
    .eq("user_id", userId)
    .eq("source_type", "email")
    .gte("occurred_at", since)
    .not("thread_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) {
    return error.code === UNDEFINED_COLUMN
      ? { threadsResolved: 0, followUpsClosed: 0, degradeNote: APPLY_0024_NOTE }
      : { threadsResolved: 0, followUpsClosed: 0 };
  }

  // Many stored messages can share one thread — dedupe to unique threads (newest first), then cap.
  const sourcesByThread = new Map<string, string[]>();
  const threadOrder: string[] = [];
  for (const r of rows ?? []) {
    const tid = r.thread_id as string | null;
    if (!tid) continue;
    let arr = sourcesByThread.get(tid);
    if (!arr) {
      arr = [];
      sourcesByThread.set(tid, arr);
      threadOrder.push(tid);
    }
    arr.push(r.id as string);
  }
  const threads = threadOrder.slice(0, THREAD_CAP);
  if (!threads.length) return { threadsResolved: 0, followUpsClosed: 0 };

  const conn = await getConnection(supabase, userId);
  const userEmail = conn?.email ?? "";

  let threadsResolved = 0;
  const answeredSourceIds: string[] = []; // sources on threads whose newest message is now from the user

  for (const tid of threads) {
    const state = await getThreadState(token, tid, userEmail);
    if (!state) continue;
    const { error: upErr } = await supabase
      .from("sources")
      .update({ last_msg_from: state.lastMsgFrom, last_msg_at: state.lastMsgAt })
      .eq("user_id", userId)
      .eq("source_type", "email")
      .eq("thread_id", tid);
    if (upErr) continue;
    threadsResolved++;
    if (state.lastMsgFrom === "me") answeredSourceIds.push(...(sourcesByThread.get(tid) ?? []));
  }

  let followUpsClosed = 0;
  if (answeredSourceIds.length) {
    const { data: doneRows } = await supabase
      .from("items")
      .update({ status: "done" })
      .eq("user_id", userId)
      .in("source_id", answeredSourceIds)
      .eq("item_type", "follow_up")
      .eq("status", "accepted")
      .select("id");
    const { data: dismissedRows } = await supabase
      .from("items")
      .update({ status: "dismissed" })
      .eq("user_id", userId)
      .in("source_id", answeredSourceIds)
      .eq("item_type", "follow_up")
      .eq("status", "review")
      .select("id");
    followUpsClosed = (doneRows?.length ?? 0) + (dismissedRows?.length ?? 0);
  }

  return { threadsResolved, followUpsClosed };
}

export type CalendarIngestResult = { imported: number };

export async function ingestCalendar(supabase: SupabaseClient, userId: string): Promise<CalendarIngestResult> {
  const token = await getValidAccessToken(supabase, userId);
  const events = await listEvents(token, new Date().toISOString(), 50);
  if (!events.length) return { imported: 0 };

  const { data: existing } = await supabase
    .from("sources")
    .select("external_id")
    .eq("source_type", "calendar")
    .not("external_id", "is", null);
  const seen = new Set((existing ?? []).map((r) => r.external_id as string));

  let imported = 0;
  for (const ev of events) {
    // End time lives in its own column (ends_at) so it stays a real timestamp the UI/assistant format
    // deterministically, never a raw ISO buried in raw_text for the model to misread. raw_text now
    // carries only the human detail (location); all-day-ness is flagged so display drops the time.
    const fields = {
      title: ev.summary,
      permalink: ev.htmlLink ?? null,
      occurred_at: ev.startISO,
      ends_at: ev.endISO ?? null,
      is_all_day: ev.allDay,
      raw_text: ev.location || null,
    };
    if (seen.has(ev.id)) {
      // Refresh an event we've already ingested: this picks up reschedules AND self-heals rows stored
      // before ends_at / is_all_day existed. user_id is explicit (belt-and-suspenders with RLS) so a
      // Google event id shared across calendars can never touch another user's row.
      await supabase.from("sources").update(fields).eq("user_id", userId).eq("source_type", "calendar").eq("external_id", ev.id);
      continue;
    }
    await supabase.from("sources").insert({ user_id: userId, source_type: "calendar", external_id: ev.id, ...fields });
    imported++;
  }
  return { imported };
}
