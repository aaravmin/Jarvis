import type { ColumnDef } from "./types";

/** Quote a CSV field per RFC 4180 (wrap in quotes if it has a comma, quote, or newline). */
function csvField(value: string): string {
  const v = value ?? "";
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Build a CSV string from rows + columns (one header row, then a row per record). */
export function toCsv<R>(rows: R[], columns: ColumnDef<R>[]): string {
  const cols = columns.filter((c) => c.type !== "readonly" || c.key !== "select");
  const header = cols.map((c) => csvField(c.label)).join(",");
  const body = rows.map((r) => cols.map((c) => csvField(c.get(r))).join(",")).join("\n");
  return `${header}\n${body}`;
}

/** Trigger a client-side download of `content` as a file. No server round-trip. */
export function downloadFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Build a TSV (tab-separated, header included) for clipboard copy that pastes cleanly into Sheets. */
export function toTsv<R>(rows: R[], columns: ColumnDef<R>[]): string {
  const cols = columns.filter((c) => c.key !== "select");
  const clean = (s: string) => (s ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  const header = cols.map((c) => clean(c.label)).join("\t");
  const body = rows.map((r) => cols.map((c) => clean(c.get(r))).join("\t")).join("\n");
  return `${header}\n${body}`;
}
