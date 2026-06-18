import "server-only";

/** Google Calendar client. Reads upcoming events (ingest) and creates new events (write feature). */

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type CalEvent = {
  id: string;
  summary: string;
  startISO: string;
  endISO?: string;
  allDay: boolean;
  location?: string;
  htmlLink?: string;
};

/**
 * An all-day date (YYYY-MM-DD) anchored at LOCAL noon, ±dayOffset days. Noon-local is DST-safe and,
 * unlike UTC-midnight, never skews to the previous day when rendered in a negative-offset zone — so an
 * all-day event keeps its real date everywhere (hard rule #7). Used to store all-day starts/ends.
 */
function allDayNoonISO(ymd: string, dayOffset = 0): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d + dayOffset, 12, 0, 0).toISOString();
}

export async function listEvents(token: string, timeMinISO: string, max = 50): Promise<CalEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMinISO,
    maxResults: String(max),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const res = await fetch(`${API}?${params.toString()}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Calendar list failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    items?: {
      id: string;
      summary?: string;
      location?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }[];
  };
  return (data.items ?? [])
    .map((e) => {
      // All-day events have start.date (YYYY-MM-DD) and NO start.dateTime; timed events have dateTime.
      const allDay = !e.start?.dateTime && !!e.start?.date;
      const startRaw = e.start?.dateTime ?? e.start?.date;
      if (!startRaw) return null;
      let startISO: string;
      let endISO: string | undefined;
      if (allDay) {
        startISO = allDayNoonISO(e.start!.date!);
        // Google's all-day end.date is EXCLUSIVE (the morning after) — step back to the last
        // included day so a one-day event reads as a single date, not a two-day span.
        endISO = e.end?.date ? allDayNoonISO(e.end.date, -1) : undefined;
      } else {
        startISO = new Date(startRaw).toISOString();
        const endRaw = e.end?.dateTime ?? e.end?.date;
        endISO = endRaw ? new Date(endRaw).toISOString() : undefined;
      }
      return {
        id: e.id,
        summary: e.summary ?? "(busy)",
        startISO,
        endISO,
        allDay,
        location: e.location,
        htmlLink: e.htmlLink,
      } as CalEvent;
    })
    .filter((x): x is CalEvent => x !== null);
}

export type NewEvent = {
  summary: string;
  startISO: string; // for timed events; an ISO datetime with offset/Z
  endISO?: string; // defaults to start + 60 min for timed events
  description?: string;
  location?: string;
  /** All-day event: pass a YYYY-MM-DD `startDate` instead of startISO/endISO. */
  startDate?: string;
  endDate?: string; // exclusive end date for all-day; defaults to startDate + 1 day
};

/**
 * Create a real event on the user's primary calendar. Requires the calendar.events scope. We never let
 * the LLM compute the times — callers pass already-resolved ISO strings (hard rule #2). The only date
 * math here is the deterministic +60min / +1day default, done in code, never by the model.
 */
export async function createEvent(token: string, ev: NewEvent): Promise<CalEvent> {
  let start: { dateTime?: string; date?: string };
  let end: { dateTime?: string; date?: string };

  if (ev.startDate) {
    const endDate =
      ev.endDate ?? new Date(new Date(`${ev.startDate}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    start = { date: ev.startDate };
    end = { date: endDate };
  } else {
    const startMs = new Date(ev.startISO).getTime();
    if (Number.isNaN(startMs)) throw new Error(`Invalid event start time: "${ev.startISO}".`);
    const endISO = ev.endISO ?? new Date(startMs + 60 * 60 * 1000).toISOString();
    start = { dateTime: ev.startISO };
    end = { dateTime: endISO };
  }

  const res = await fetch(API, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: ev.summary,
      description: ev.description,
      location: ev.location,
      start,
      end,
    }),
  });
  if (!res.ok) throw new Error(`Calendar event create failed (${res.status}): ${await res.text()}`);
  const e = (await res.json()) as {
    id: string;
    summary?: string;
    location?: string;
    htmlLink?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };
  const allDay = !e.start?.dateTime && !!(e.start?.date ?? ev.startDate);
  if (allDay) {
    const startDate = e.start?.date ?? ev.startDate!;
    const endDate = e.end?.date; // exclusive
    return {
      id: e.id,
      summary: e.summary ?? ev.summary,
      startISO: allDayNoonISO(startDate),
      endISO: endDate ? allDayNoonISO(endDate, -1) : undefined,
      allDay: true,
      location: e.location,
      htmlLink: e.htmlLink,
    };
  }
  const s = e.start?.dateTime ?? ev.startISO;
  const endRaw = e.end?.dateTime;
  return {
    id: e.id,
    summary: e.summary ?? ev.summary,
    startISO: new Date(s).toISOString(),
    endISO: endRaw ? new Date(endRaw).toISOString() : undefined,
    allDay: false,
    location: e.location,
    htmlLink: e.htmlLink,
  };
}
