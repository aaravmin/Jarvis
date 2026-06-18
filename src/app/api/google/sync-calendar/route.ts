import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestCalendar } from "@/lib/google/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/google/sync-calendar — pull upcoming events as-is into the Calendar tab. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    const result = await ingestCalendar(supabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed." }, { status: 500 });
  }
}
