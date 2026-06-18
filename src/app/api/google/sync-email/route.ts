import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestGmail } from "@/lib/google/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/google/sync-email — pull recent Gmail, triage, store important + add senders to Contacts. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const result = await ingestGmail(supabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 500 });
  }
}
