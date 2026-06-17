import "server-only";

/** Google Sheets read client (read-only). Used by the contacts-from-sheet feature. */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Pull a spreadsheet id out of a full Sheets URL, or pass through a bare id. */
export function extractSpreadsheetId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s; // looks like a bare id
  return null;
}

export type SheetData = {
  title: string;
  rows: string[][]; // raw cell values, first row typically the header
};

/** Read a spreadsheet's first sheet (or an explicit A1 range) as rows of strings. */
export async function readSheet(
  accessToken: string,
  spreadsheetId: string,
  range = "A1:Z2000",
): Promise<SheetData> {
  const meta = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=properties.title`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!meta.ok) throw new Error(`Sheets metadata failed (${meta.status}): ${await meta.text()}`);
  const title = ((await meta.json()) as { properties?: { title?: string } }).properties?.title ?? "Spreadsheet";

  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Sheets read failed (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as { values?: string[][] };
  return { title, rows: (j.values ?? []).map((r) => r.map((c) => (c ?? "").toString())) };
}
