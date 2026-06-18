/**
 * Display-only date formatting. (Per project rules, the LLM never computes dates and we never
 * trust it to — but formatting an already-resolved timestamp for display is fine.)
 */
export function formatWhen(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Time only (no date) — e.g. "9:00 PM". Used for the end of a same-day event range. */
export function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * A calendar event's time span, formatted deterministically from already-resolved timestamps — the
 * assistant is handed this exact string and never computes or reinterprets it (hard rules #2/#7).
 * Timed, same day → "Jun 18, 2026, 8:00 PM – 9:00 PM"; spans days → both ends dated in full; no end →
 * just the start. All-day events render a plain DATE with NO time (a single date, or "Jun 18 – Jun 20"
 * for a multi-day span) so we never invent a clock time for an event that has none.
 */
export function formatEventTime(startISO?: string, endISO?: string, allDay = false): string {
  if (allDay) {
    const start = formatDate(startISO);
    if (!start) return "";
    const end = formatDate(endISO);
    return end && end !== start ? `${start} – ${end}` : start;
  }
  const start = formatWhen(startISO);
  if (!start) return "";
  if (!endISO) return start;
  const s = new Date(startISO!);
  const e = new Date(endISO);
  if (Number.isNaN(e.getTime())) return start;
  const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  return `${start} – ${sameDay ? formatTime(endISO) : formatWhen(endISO)}`;
}

/**
 * A calendar event's location, pulled from sources.raw_text. raw_text now holds just the location,
 * but rows ingested before the ends_at column existed carry the legacy "until <ISO> · <location>"
 * form — strip that prefix so we never surface a raw end-time ISO. The end time always comes from the
 * ends_at column (a real timestamp), never from this string.
 */
export function calendarLocation(raw?: string | null): string {
  if (!raw) return "";
  // Legacy form only: "until <ISO>" optionally followed by "· <location>". The middot is treated as a
  // delimiter ONLY here — a current-format location is raw_text verbatim and may itself contain "·".
  if (/^until\s+\S+/.test(raw)) {
    return raw.includes("·") ? raw.split("·").pop()?.trim() ?? "" : "";
  }
  return raw.trim();
}

/** Date only (no time) — for deadlines/event dates where a time component would be misleading. */
export function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Whole days from now until `iso` (negative = past). Display-only; the resolved date is already set. */
export function daysUntil(iso?: string): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

const SOURCE_LABELS: Record<string, string> = {
  email: "Email",
  meeting: "Meeting",
  calendar: "Calendar",
  manual: "Manual",
  research: "Web research",
};

export function sourceLabel(type: string): string {
  return SOURCE_LABELS[type] ?? "Source";
}
