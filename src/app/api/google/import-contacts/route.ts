import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importContactsFromSheet } from "@/lib/google/import-contacts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/google/import-contacts, { sheet: <url|id> }. Reads the Google Sheet and lands each row in
 * the Review queue as a suggested contact (provenance = the sheet + the row). Returns { runId, resultCount }.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { sheet?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const sheet = (body.sheet ?? "").trim();
  if (!sheet) return NextResponse.json({ error: "Paste a Google Sheets link." }, { status: 400 });

  try {
    const result = await importContactsFromSheet(supabase, user.id, sheet);
    return NextResponse.json({ ...result, redirectTo: "/review" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
