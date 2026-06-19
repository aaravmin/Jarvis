import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { backfillExtraction } from "@/lib/items/backfill";

// Mines already-ingested emails/meetings for action items (a Gemini call per source) — can take a while.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/items/backfill — extract action items from sources that were ingested before the
 * extractor ran. Returns { scanned, inserted, remaining }. Idempotent: already-mined sources skipped.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const result = await backfillExtraction(supabase, user.id);
    return NextResponse.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Couldn't scan past messages.";
    return NextResponse.json({ error }, { status: 500 });
  }
}
