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

const SOURCE_LABELS: Record<string, string> = {
  email: "Email",
  meeting: "Meeting",
  calendar: "Calendar",
  manual: "Manual",
};

export function sourceLabel(type: string): string {
  return SOURCE_LABELS[type] ?? "Source";
}
