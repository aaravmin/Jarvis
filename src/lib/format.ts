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
