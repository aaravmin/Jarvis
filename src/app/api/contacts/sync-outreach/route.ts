import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncOutreachFromEmail } from "@/lib/contacts/sync-outreach";

/**
 * Auto-populate contact outreach status from ingested email. Deterministic (no LLM); only advances a
 * contact to "spoke" when their email address is the sender of an ingested email, and never overwrites
 * a more-advanced manual value. Manual edits via /api/contacts/status always win.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const result = await syncOutreachFromEmail(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed." },
      { status: 500 },
    );
  }
}
