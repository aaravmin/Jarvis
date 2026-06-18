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
    const msg = err instanceof Error ? err.message : "";
    console.error("contacts/export-sheet failed:", msg);
    const userMsg =
      msg.startsWith("Reconnect Google") || msg.startsWith("You have no")
        ? msg
        : "Could not export contacts. Try reconnecting Google.";
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
