import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTokenWithScope } from "@/lib/google/store";
import { SCOPE_SPREADSHEETS } from "@/lib/google/oauth";
import { createSpreadsheet, writeValues, formatExportSheet } from "@/lib/google/sheets";
import { loadAllAcceptedContacts } from "@/lib/research/load";
import { CONTACT_OUTREACH_STATUSES, type DiscoveredPerson } from "@/lib/research/types";

/**
 * Export the user's full contact list to a brand-new Google Sheet: name, info, relevance, where to
 * reach them, and the outreach status, with the status column wired as an editable dropdown so the
 * toggle lives in the sheet too (Supabase stays the system of record; this is a one-way snapshot).
 */

const STATUS_LABEL = new Map(CONTACT_OUTREACH_STATUSES.map((s) => [s.value, s.label]));
const STATUS_OPTIONS = CONTACT_OUTREACH_STATUSES.map((s) => s.label);

const HEADER = ["Name", "Company", "Role", "Information", "Relevance", "Email", "LinkedIn", "Other contact", "Outreach status"];
const STATUS_COL_INDEX = HEADER.length - 1;

function channel(p: DiscoveredPerson, kind: string): string {
  return p.channels.find((c) => c.kind === kind)?.value ?? "";
}

function otherContact(p: DiscoveredPerson): string {
  return p.channels
    .filter((c) => c.kind !== "email" && c.kind !== "linkedin")
    .map((c) => `${c.kind}: ${c.value}`)
    .join(" · ");
}

function buildRows(people: DiscoveredPerson[]): string[][] {
  return people.map((p) => [
    p.fullName,
    p.company ?? "",
    p.roleTitle ?? "",
    p.background ?? "",
    p.relevance ?? "",
    channel(p, "email"),
    channel(p, "linkedin"),
    otherContact(p),
    STATUS_LABEL.get(p.outreachStatus) ?? p.outreachStatus,
  ]);
}

/** Column letter for a 0-based index (A, B, …, the export stays well under 26 columns). */
function colLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export async function exportContactsToSheet(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ url: string; count: number }> {
  const people = await loadAllAcceptedContacts(supabase);
  if (people.length === 0) throw new Error("You have no saved contacts to export yet.");

  const token = await getTokenWithScope(supabase, userId, SCOPE_SPREADSHEETS, "exporting contacts to Google Sheets");

  const dateLabel = new Date().toISOString().slice(0, 10);
  const sheet = await createSpreadsheet(token, `Jarvis Contacts, ${dateLabel}`, "Contacts");

  const rows = buildRows(people);
  const values: string[][] = [HEADER, ...rows];
  await writeValues(token, sheet.spreadsheetId, `A1:${colLetter(HEADER.length - 1)}${values.length}`, values);

  await formatExportSheet(token, sheet.spreadsheetId, {
    sheetId: sheet.sheetId,
    columnCount: HEADER.length,
    dataRowCount: rows.length,
    statusColIndex: STATUS_COL_INDEX,
    statusOptions: STATUS_OPTIONS,
  });

  return { url: sheet.spreadsheetUrl, count: people.length };
}
