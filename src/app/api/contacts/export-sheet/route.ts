import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportContactsToSheet } from "@/lib/contacts/export-sheet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/contacts/export-sheet — create a Google Sheet of the user's contacts and return its URL.
 * Requires the spreadsheets scope (friendly reconnect error otherwise).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const result = await exportContactsToSheet(supabase, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not export contacts." },
      { status: 500 },
    );
  }
}
