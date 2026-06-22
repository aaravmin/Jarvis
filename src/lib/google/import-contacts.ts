import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/google/store";
import { readSheet, extractSpreadsheetId } from "@/lib/google/sheets";

/**
 * contacts-from-sheet: read a Google Sheet (e.g. an alumni database) and land each row in the Review
 * queue as a suggested contact, with the sheet + the exact row as provenance (hard rules #3 + #5).
 *
 * Column mapping is heuristic (no LLM), robust and deterministic for typical sheets. Rows reuse the
 * `research_runs` "run" abstraction so they show in Review via the existing people UI; nothing lands
 * in Contacts until the user accepts it.
 */

type ColumnMap = {
  fullName?: number;
  firstName?: number;
  lastName?: number;
  email?: number;
  company?: number;
  roleTitle?: number;
  linkedin?: number;
};

function mapHeader(header: string[]): ColumnMap {
  const norm = header.map((h) => h.toLowerCase().trim());
  const find = (re: RegExp, exclude?: RegExp) =>
    norm.findIndex((h) => re.test(h) && !(exclude && exclude.test(h)));
  const idx = (i: number) => (i >= 0 ? i : undefined);
  return {
    fullName: idx(find(/^(full ?name|name)$/)),
    firstName: idx(find(/first ?name/)),
    lastName: idx(find(/last ?name|surname/)),
    email: idx(find(/e-?mail/)),
    company: idx(find(/company|organization|organisation|employer|firm/)),
    roleTitle: idx(find(/title|role|position|occupation/, /company/)),
    linkedin: idx(find(/linkedin/)),
  };
}

function cell(row: string[], i?: number): string {
  return i != null ? (row[i] ?? "").trim() : "";
}

function buildName(row: string[], map: ColumnMap): string {
  const full = cell(row, map.fullName);
  if (full) return full;
  const fn = cell(row, map.firstName);
  const ln = cell(row, map.lastName);
  return `${fn} ${ln}`.trim();
}

export type SheetImportResult = { runId: string; resultCount: number; sheetTitle: string };

export async function importContactsFromSheet(
  supabase: SupabaseClient,
  userId: string,
  sheetUrlOrId: string,
): Promise<SheetImportResult> {
  const token = await getValidAccessToken(supabase, userId);
  const id = extractSpreadsheetId(sheetUrlOrId);
  if (!id) throw new Error("That doesn't look like a Google Sheets link or id.");

  const { title, rows } = await readSheet(token, id);
  if (rows.length < 2) throw new Error("The sheet has no data rows beneath a header row.");
  const header = rows[0];
  const map = mapHeader(header);
  if (map.fullName == null && map.firstName == null && map.lastName == null) {
    throw new Error("Couldn't find a name column. Add a 'Name' (or 'First/Last Name') header.");
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  const nowISO = new Date().toISOString();

  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .insert({ user_id: userId, query: `Imported from "${title}"`, target_kind: "people", status: "running" })
    .select("id")
    .single();
  if (runErr || !run) throw new Error(runErr?.message ?? "Could not create import run.");
  const runId = run.id as string;

  const { data: source } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      source_type: "sheet",
      title,
      permalink: sheetUrl,
      occurred_at: nowISO,
      raw_text: `Imported from the Google Sheet "${title}".`,
    })
    .select("id")
    .single();
  const sourceId = (source?.id as string | undefined) ?? null;
  if (sourceId) await supabase.from("research_runs").update({ source_id: sourceId }).eq("id", runId);

  let count = 0;
  for (const row of rows.slice(1)) {
    const fullName = buildName(row, map);
    if (!fullName) continue;
    // The exact row, as the provenance quote (must be non-empty, DB CHECK).
    const rowQuote = header
      .map((h, i) => (row[i] ? `${h}: ${row[i]}` : null))
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);
    if (!rowQuote) continue;

    const { data: contact, error: cErr } = await supabase
      .from("contacts")
      .insert({
        user_id: userId,
        full_name: fullName,
        company: cell(row, map.company) || null,
        role_title: cell(row, map.roleTitle) || null,
        source_id: sourceId,
        source_quote: rowQuote,
        review_status: "review",
        created_by: "jarvis",
        research_run_id: runId,
      })
      .select("id")
      .single();
    if (cErr || !contact) continue;
    const contactId = contact.id as string;

    const channels: { contact_id: string; kind: string; value: string; is_primary: boolean }[] = [];
    const email = cell(row, map.email);
    const linkedin = cell(row, map.linkedin);
    if (email) channels.push({ contact_id: contactId, kind: "email", value: email, is_primary: true });
    if (linkedin) channels.push({ contact_id: contactId, kind: "linkedin", value: linkedin, is_primary: !email });
    if (channels.length) await supabase.from("contact_channels").insert(channels);
    count++;
  }

  await supabase.from("research_runs").update({ status: "done", result_count: count }).eq("id", runId);
  return { runId, resultCount: count, sheetTitle: title };
}
