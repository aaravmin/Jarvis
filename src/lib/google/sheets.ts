import "server-only";

/** Google Sheets client. Reads sheets (contacts import) and creates/writes them (contacts export). */

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

// ── Write side (export) ──────────────────────────────────────────────────────

export type NewSpreadsheet = { spreadsheetId: string; spreadsheetUrl: string; sheetId: number };

/** Create a new spreadsheet with a single named sheet. Requires the spreadsheets scope. */
export async function createSpreadsheet(
  accessToken: string,
  title: string,
  sheetTitle = "Contacts",
): Promise<NewSpreadsheet> {
  const res = await fetch(SHEETS_API, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ properties: { title }, sheets: [{ properties: { title: sheetTitle } }] }),
  });
  if (!res.ok) throw new Error(`Sheet create failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets?: { properties?: { sheetId?: number } }[];
  };
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    sheetId: data.sheets?.[0]?.properties?.sheetId ?? 0,
  };
}

/** Write a 2D array of values into an A1 range (RAW input, overwrites). */
export async function writeValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) throw new Error(`Sheets write failed (${res.status}): ${await res.text()}`);
}

/**
 * Apply finishing touches via batchUpdate: bold + frozen header, auto-sized columns, and a dropdown
 * (data validation) on the status column so the *sheet itself* carries the status toggle the user
 * asked for — editable in Google Sheets directly.
 */
export async function formatExportSheet(
  accessToken: string,
  spreadsheetId: string,
  opts: { sheetId: number; columnCount: number; dataRowCount: number; statusColIndex: number; statusOptions: string[] },
): Promise<void> {
  const { sheetId, columnCount, dataRowCount, statusColIndex, statusOptions } = opts;
  const requests: unknown[] = [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.09, green: 0.55, blue: 0.6 } } },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columnCount },
      },
    },
  ];
  if (dataRowCount > 0 && statusOptions.length > 0) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: dataRowCount + 1,
          startColumnIndex: statusColIndex,
          endColumnIndex: statusColIndex + 1,
        },
        rule: {
          condition: { type: "ONE_OF_LIST", values: statusOptions.map((v) => ({ userEnteredValue: v })) },
          showCustomUi: true,
          strict: false,
        },
      },
    });
  }
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Sheets format failed (${res.status}): ${await res.text()}`);
}
