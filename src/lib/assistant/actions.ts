import "server-only";
import * as chrono from "chrono-node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTokenWithScope } from "@/lib/google/store";
import { SCOPE_CALENDAR_EVENTS, SCOPE_GMAIL_COMPOSE, SCOPE_DRIVE_READONLY } from "@/lib/google/oauth";
import { createEvent } from "@/lib/google/calendar";
import { createDraft } from "@/lib/google/gmail";
import { extractFileId, findDocsByName, readDocText } from "@/lib/google/drive";
import { saveDriveTemplate } from "@/lib/templates/store";
import { formatWhen } from "@/lib/format";
import type { AskActionRef } from "@/lib/assistant/types";

/**
 * The WRITE side of the Jarvis assistant — the actions it can take on the user's behalf, wired into
 * ask()'s tool loop. Everything here is gated and conservative:
 *   • Calendar: creates a real event (calendar.events scope), but the model NEVER computes the time —
 *     it passes the user's verbatim phrase and resolveEventTime() resolves it with chrono (hard rule #2).
 *   • Email: creates a DRAFT only (gmail.compose) — nothing is ever sent without the user (autonomy L0,
 *     hard rule #5).
 *   • Templates: reads a Drive doc the user names and saves it as a template (drive.readonly + Supabase
 *     system of record, hard rule #1).
 * A missing scope surfaces as a clear "reconnect Google" message rather than an opaque 403. Tokens are
 * read server-side only (hard rule #6).
 */

export type ActionOutcome = { ok: boolean; message: string; ref?: AskActionRef };

export type AskActions = {
  createCalendarEvent: (a: {
    summary?: string;
    when?: string;
    location?: string;
    description?: string;
  }) => Promise<ActionOutcome>;
  draftEmail: (a: { to?: string; subject?: string; body?: string }) => Promise<ActionOutcome>;
  saveTemplate: (a: { document?: string; name?: string }) => Promise<ActionOutcome>;
};

const MAX_DATE_INPUT = 200;

type ResolvedTime =
  | { ok: true; startISO?: string; endISO?: string; startDate?: string; endDate?: string }
  | { ok: false };

/** YYYY-MM-DD in the server's local zone (for all-day events). */
function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The calendar day AFTER d, as YYYY-MM-DD (local, DST-safe — uses the local-midnight constructor). */
function nextDayYmd(d: Date): string {
  return ymdLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

/**
 * Format a YYYY-MM-DD as a plain calendar date for display, WITHOUT a timezone round-trip. Parsing a
 * bare date as UTC-midnight and rendering it in a negative-offset zone (e.g. America/New_York) would
 * show the previous day; anchoring at noon-local avoids that skew so the confirmation matches the
 * actual all-day date (hard rule #7 — never tell the user a wrong date).
 */
function formatYmdLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Has chrono pinned an actual time-of-day? True when the hour is explicit ("3pm") OR when a
 * day-segment word implied one ("tonight"/"this morning" leave isCertain('hour') false but set a
 * meridiem). A pure date ("June 20", "next Friday") sets neither, so it stays all-day.
 */
function hasClockIntent(c: chrono.ParsedComponents): boolean {
  return c.isCertain("hour") || c.get("meridiem") !== null;
}

/**
 * Hard-rule-#2 boundary for calendar events. The model hands us the user's VERBATIM phrase
 * ("tomorrow at 3pm", "next Friday 2–3pm", "June 20") and chrono resolves it here — the model never
 * emits a computed date. A phrase with a time-of-day → a timed event; a day-only phrase → an all-day
 * event. Ambiguous dates resolve forward (the next occurrence). Unparseable → ok:false, and the
 * assistant asks the user to clarify rather than guessing.
 *
 * Timezone: chrono interprets clock times in the server's local zone unless the phrase names one
 * ("3pm ET"). For this localhost personal app the server zone is the user's, matching the existing
 * deadline resolver; honor an explicit zone when given.
 */
function resolveEventTime(raw: string, refISO: string): ResolvedTime {
  const text = (raw ?? "").trim();
  if (!text || text.length > MAX_DATE_INPUT) return { ok: false };
  const ref = (() => {
    const d = new Date(refISO);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  })();
  let results: ReturnType<typeof chrono.parse>;
  try {
    results = chrono.parse(text, ref, { forwardDate: true });
  } catch {
    return { ok: false };
  }
  const first = results[0];
  if (!first) return { ok: false };

  if (hasClockIntent(first.start)) {
    const startISO = first.start.date().toISOString();
    const endISO = first.end && hasClockIntent(first.end) ? first.end.date().toISOString() : undefined;
    return { ok: true, startISO, endISO };
  }
  // Day-only → all-day event. chrono's range end is INCLUSIVE ("June 20 to June 22" means through the
  // 22nd), but Google Calendar all-day end dates are EXCLUSIVE — so bump one day. (createEvent applies
  // the same +1 when no end is supplied, so single-day and multi-day all-day events stay consistent.)
  const startDate = ymdLocal(first.start.date());
  const endDate = first.end ? nextDayYmd(first.end.date()) : undefined;
  return { ok: true, startDate, endDate };
}

/** Turn a thrown error into a user-facing line, passing through our actionable "Reconnect Google…" text. */
function friendly(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg.startsWith("Reconnect Google") || msg.startsWith("Google account not connected")) return msg;
  return fallback;
}

/**
 * Build the action closures for one assistant request. `refISO` is captured once (now) so every date
 * phrase in the turn resolves against a single, stable reference.
 */
export function buildAskActions(supabase: SupabaseClient, userId: string): AskActions {
  const refISO = new Date().toISOString();

  return {
    async createCalendarEvent({ summary, when, location, description }) {
      const title = (summary ?? "").trim();
      if (!title) return { ok: false, message: "I need a title for the event before I can add it." };

      const t = resolveEventTime(when ?? "", refISO);
      if (!t.ok) {
        return {
          ok: false,
          message: `I couldn't work out when to schedule "${title}". Give me a date and time — for example "tomorrow at 3pm" or "June 20 from 2 to 3pm".`,
        };
      }

      let token: string;
      try {
        token = await getTokenWithScope(supabase, userId, SCOPE_CALENDAR_EVENTS, "adding events to your calendar");
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't reach your Google Calendar.") };
      }

      try {
        const ev = await createEvent(token, {
          summary: title,
          startISO: t.startISO ?? "",
          endISO: t.endISO,
          startDate: t.startDate,
          endDate: t.endDate,
          description: description?.trim() || undefined,
          location: location?.trim() || undefined,
        });
        // All-day: format from the resolved YYYY-MM-DD directly (never round-trip through a UTC Date,
        // which would show the prior day in a negative-offset zone). Timed: formatWhen on the instant.
        const whenLabel = t.startDate ? formatYmdLabel(t.startDate) : formatWhen(ev.startISO);
        return {
          ok: true,
          message: `Created "${title}" on your calendar for ${whenLabel}${ev.location ? ` at ${ev.location}` : ""}.`,
          ref: {
            kind: "event",
            label: `Open "${title}" in Google Calendar`,
            url: ev.htmlLink,
            detail: `${whenLabel}${ev.location ? ` · ${ev.location}` : ""}`,
          },
        };
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't create that event — please try again.") };
      }
    },

    async draftEmail({ to, subject, body }) {
      const subj = (subject ?? "").trim();
      const text = (body ?? "").trim();
      if (!text) return { ok: false, message: "I need the body of the email to draft it." };

      let token: string;
      try {
        token = await getTokenWithScope(supabase, userId, SCOPE_GMAIL_COMPOSE, "drafting emails in Gmail");
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't reach your Gmail.") };
      }

      try {
        const draft = await createDraft(token, { to: to?.trim() || undefined, subject: subj || "(no subject)", body: text });
        const who = to?.trim() ? ` to ${to.trim()}` : "";
        return {
          ok: true,
          message: `I saved a draft${who}${subj ? ` ("${subj}")` : ""} in your Gmail Drafts. Nothing is sent — review and send it yourself.`,
          ref: {
            kind: "draft",
            label: "Open in Gmail drafts",
            url: draft.url,
            detail: `${to?.trim() ? `To ${to.trim()}` : "Draft"}${subj ? ` · ${subj}` : ""}`,
          },
        };
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't create that draft — please try again.") };
      }
    },

    async saveTemplate({ document, name }) {
      const docRef = (document ?? "").trim();
      if (!docRef) return { ok: false, message: "Tell me which Google Doc to save — its name or its link." };

      let token: string;
      try {
        token = await getTokenWithScope(supabase, userId, SCOPE_DRIVE_READONLY, "saving templates from Google Drive");
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't reach your Google Drive.") };
      }

      try {
        // Accept a Drive/Docs URL or bare id directly; otherwise search the user's Docs by name.
        let fileId = extractFileId(docRef);
        let note = "";
        if (!fileId) {
          const matches = await findDocsByName(token, docRef);
          if (matches.length === 0) {
            return { ok: false, message: `I couldn't find a Google Doc named "${docRef}" in your Drive. Check the name, or paste the document's link.` };
          }
          fileId = matches[0].id; // most-recently-modified match
          if (matches.length > 1) note = ` (I matched the most recent of ${matches.length} docs named like that)`;
        }

        const doc = await readDocText(token, fileId);
        const saved = await saveDriveTemplate(supabase, userId, {
          name: name?.trim() || doc.name,
          body: doc.text,
          driveFileId: fileId,
        });
        return {
          ok: true,
          message: `Saved "${saved.name}" as a template from your Google Doc${note}. You'll find it on the Templates page.`,
          ref: {
            kind: "template",
            label: `Open "${doc.name}" in Google Docs`,
            url: doc.webViewLink,
            detail: `Saved to Templates as "${saved.name}"`,
          },
        };
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't save that document as a template — please try again.") };
      }
    },
  };
}
