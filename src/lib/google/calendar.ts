import "server-only";

/** Google Calendar read client (read-only). Lists upcoming events (kept as-is, unfiltered). */

const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type CalEvent = {
  id: string;
  summary: string;
  startISO: string;
  endISO?: string;
  location?: string;
  htmlLink?: string;
};

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
      const start = e.start?.dateTime ?? e.start?.date;
      if (!start) return null;
      const startISO = new Date(start).toISOString();
      const endRaw = e.end?.dateTime ?? e.end?.date;
      return {
        id: e.id,
        summary: e.summary ?? "(busy)",
        startISO,
        endISO: endRaw ? new Date(endRaw).toISOString() : undefined,
        location: e.location,
        htmlLink: e.htmlLink,
      } as CalEvent;
    })
    .filter((x): x is CalEvent => x !== null);
}
