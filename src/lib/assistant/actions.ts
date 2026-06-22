import "server-only";
import * as chrono from "chrono-node";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTokenWithScope } from "@/lib/google/store";
import { SCOPE_CALENDAR_EVENTS, SCOPE_GMAIL_COMPOSE, SCOPE_DRIVE_READONLY } from "@/lib/google/oauth";
import { createEvent } from "@/lib/google/calendar";
import { createDraft } from "@/lib/google/gmail";
import { extractFileId, findDocsByName, readDocText } from "@/lib/google/drive";
import { saveDriveTemplate, listTemplates as loadTemplates } from "@/lib/templates/store";
import { addContact as addContactByQuery } from "@/lib/contacts/add-contact";
import { formatWhen } from "@/lib/format";
import type { AskActionRef } from "@/lib/assistant/types";

/**
 * The WRITE side of the Jarvis assistant, the actions it can take on the user's behalf, wired into
 * ask()'s tool loop. Everything here is gated and conservative:
 *   • Calendar: creates a real event (calendar.events scope), but the model NEVER computes the time -
 *     it passes the user's verbatim phrase and resolveEventTime() resolves it with chrono (hard rule #2).
 *   • Email: creates a DRAFT only (gmail.compose), nothing is ever sent without the user (autonomy L0,
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
  /** Read-only: the user's saved templates, so Jarvis can adapt one before drafting. No ref/receipt. */
  listTemplates: () => Promise<{ ok: boolean; message: string }>;
  /** Find a person online (LinkedIn scrape + Apollo) and save them as a contact. */
  addContact: (a: { name?: string; linkedin_url?: string; company?: string; context?: string }) => Promise<ActionOutcome>;
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

/** The calendar day AFTER d, as YYYY-MM-DD (local, DST-safe, uses the local-midnight constructor). */
function nextDayYmd(d: Date): string {
  return ymdLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

/** Turn an EXCLUSIVE all-day end (YYYY-MM-DD) back into the last INCLUDED day, for display. */
function prevDayYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return ymdLocal(new Date(y, m - 1, d - 1));
}

/**
 * Format a YYYY-MM-DD as a plain calendar date for display, WITHOUT a timezone round-trip. Parsing a
 * bare date as UTC-midnight and rendering it in a negative-offset zone (e.g. America/New_York) would
 * show the previous day; anchoring at noon-local avoids that skew so the confirmation matches the
 * actual all-day date (hard rule #7, never tell the user a wrong date).
 */
function formatYmdLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * A human label for a resolved time. Handles all-day RANGES and multi-day TIMED spans so the
 * confirmation never understates a multi-day booking by showing only its first day (hard rule #7).
 */
function describeResolved(t: { startISO?: string; endISO?: string; startDate?: string; endDate?: string }): string {
  if (t.startDate) {
    if (t.endDate) {
      const last = prevDayYmd(t.endDate); // endDate is exclusive → the last INCLUDED day is the day before
      if (last !== t.startDate) return `${formatYmdLabel(t.startDate)}, ${formatYmdLabel(last)}`;
    }
    return formatYmdLabel(t.startDate);
  }
  const start = formatWhen(t.startISO ?? "");
  if (t.endISO && t.endISO.slice(0, 10) !== (t.startISO ?? "").slice(0, 10)) {
    return `${start}, ${formatWhen(t.endISO)}`; // multi-day timed span, show the end too
  }
  return start;
}

/** Day-segment words that genuinely imply a time-of-day (chrono sets a meridiem for them). */
const SEGMENT_WORDS = /\b(tonight|morning|afternoon|evening|night|noon|midnight|midday)\b/i;

/**
 * Does this component carry an actual time-of-day? True when chrono pinned an explicit hour ("3pm"),
 * OR when a meridiem was implied AND the phrase contains a day-segment word ("tonight", "this
 * morning"). A meridiem WITHOUT a segment word does NOT count: chrono attaches a default meridiem to
 * bare relative phrases ("next week", "next month", "in 2 weeks"), and treating those as timed would
 * fabricate a clock time the user never gave (hard rules #2/#7), they must stay all-day.
 */
function isTimedComponent(c: chrono.ParsedComponents, text: string): boolean {
  if (c.isCertain("hour")) return true;
  return c.get("meridiem") !== null && SEGMENT_WORDS.test(text);
}

/**
 * Hard-rule-#2 boundary for calendar events. The model hands us the user's VERBATIM phrase
 * ("tomorrow at 3pm", "next Friday 2-3pm", "June 20") and chrono resolves it here, the model never
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

  if (isTimedComponent(first.start, text)) {
    const startISO = first.start.date().toISOString();
    let endISO: string | undefined;
    if (first.end) {
      if (isTimedComponent(first.end, text)) {
        endISO = first.end.date().toISOString(); // explicit end time ("2-3pm")
      } else {
        // Start is timed but the end is a date-only boundary ("tomorrow 9am to next Friday"). Don't
        // drop it (which would collapse to a default 1-hour event), span to the end day at the
        // start's time-of-day, so the multi-day extent the user gave is preserved.
        const s = first.start.date();
        const e = first.end.date();
        const combined = new Date(e.getFullYear(), e.getMonth(), e.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
        if (combined.getTime() > s.getTime()) endISO = combined.toISOString();
      }
    }
    return { ok: true, startISO, endISO };
  }
  // Day-only → all-day event. chrono's range end is INCLUSIVE ("June 20 to June 22" means through the
  // 22nd), but Google Calendar all-day end dates are EXCLUSIVE, so bump one day. (createEvent applies
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
          message: `I couldn't work out when to schedule "${title}". Give me a date and time, for example "tomorrow at 3pm" or "June 20 from 2 to 3pm".`,
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
        // describeResolved handles all-day vs timed AND multi-day ranges, formatting all-day dates from
        // the resolved YYYY-MM-DD directly (no UTC round-trip → no off-by-one in negative-offset zones).
        const whenLabel = describeResolved(t);
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
        return { ok: false, message: friendly(e, "I couldn't create that event, please try again.") };
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
          message: `I saved a draft${who}${subj ? ` ("${subj}")` : ""} in your Gmail Drafts. Nothing is sent, review and send it yourself.`,
          ref: {
            kind: "draft",
            label: "Open in Gmail drafts",
            url: draft.url,
            detail: `${to?.trim() ? `To ${to.trim()}` : "Draft"}${subj ? ` · ${subj}` : ""}`,
          },
        };
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't create that draft, please try again.") };
      }
    },

    async saveTemplate({ document, name }) {
      const docRef = (document ?? "").trim();
      if (!docRef) return { ok: false, message: "Tell me which Google Doc to save, its name or its link." };

      let token: string;
      try {
        token = await getTokenWithScope(supabase, userId, SCOPE_DRIVE_READONLY, "saving templates from Google Drive");
      } catch (e) {
        return { ok: false, message: friendly(e, "I couldn't reach your Google Drive.") };
      }

      try {
        // Accept a Drive/Docs URL or bare id directly; otherwise search the user's Docs by name.
        const looksLikeUrl = /https?:\/\//i.test(docRef) || docRef.includes("/");
        const idGuess = extractFileId(docRef);
        let fileId = idGuess;
        let note = "";

        const resolveByName = async (): Promise<string | null> => {
          const matches = await findDocsByName(token, docRef);
          if (matches.length === 0) return null;
          if (matches.length > 1) note = ` (I matched the most recent of ${matches.length} docs named like that)`;
          return matches[0].id; // most-recently-modified match
        };

        if (!fileId) {
          fileId = await resolveByName();
          if (!fileId) {
            return { ok: false, message: `I couldn't find a Google Doc named "${docRef}" in your Drive. Check the name, or paste the document's link.` };
          }
        }

        let doc;
        try {
          doc = await readDocText(token, fileId);
        } catch (readErr) {
          // extractFileId treats any 20+ char single token as an id, so a space-free doc NAME
          // ("OutreachTemplateV2") can be misread as one. If the read fails on an id we GUESSED from a
          // non-URL string, fall back to a name search before giving up.
          if (!idGuess || looksLikeUrl) throw readErr;
          const byName = await resolveByName();
          if (!byName) throw readErr;
          fileId = byName;
          doc = await readDocText(token, fileId);
        }

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
        return { ok: false, message: friendly(e, "I couldn't save that document as a template, please try again.") };
      }
    },

    async listTemplates() {
      try {
        const tpls = await loadTemplates(supabase, userId);
        if (tpls.length === 0) {
          return { ok: true, message: "The user has no saved templates yet. You can draft from scratch, or they can add one on the Templates page." };
        }
        // Hand the model the FULL text of each template so it can genuinely adapt one (not just
        // paraphrase a summary) before calling draft_email.
        const text = tpls
          .map((t, i) => {
            const tags = [t.connectionTypeLabel, t.source].filter(Boolean).join(", ");
            const head = `${i + 1}. "${t.name}"${tags ? ` (${tags})` : ""}`;
            const subj = t.subject ? `\nSubject: ${t.subject}` : "";
            return `${head}${subj}\nBody:\n${t.body}`;
          })
          .join("\n\n---\n\n");
        return { ok: true, message: text };
      } catch {
        return { ok: false, message: "I couldn't load your saved templates just now." };
      }
    },

    async addContact({ name, linkedin_url, company, context }) {
      try {
        const r = await addContactByQuery(supabase, userId, {
          name: name?.trim() || undefined,
          linkedinUrl: linkedin_url?.trim() || undefined,
          company: company?.trim() || undefined,
          context: context?.trim() || undefined,
        });
        if (!r.ok || !r.contactId) return { ok: false, message: r.message };
        return {
          ok: true,
          message: r.message,
          ref: {
            kind: "contact",
            // Link to their LinkedIn (the source) when we have it; otherwise it's a plain receipt.
            label: r.profileUrl ? `Open ${r.fullName ?? "this contact"} on LinkedIn` : `${r.fullName ?? "Contact"}, saved to People`,
            url: r.profileUrl ?? undefined,
            detail: [r.role, r.email].filter(Boolean).join(" · ") || undefined,
          },
        };
      } catch {
        return { ok: false, message: "I couldn't add that contact just now, try again, or paste their LinkedIn URL." };
      }
    },
  };
}
