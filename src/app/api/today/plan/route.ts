import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadAttention } from "@/lib/priority/load";

export const dynamic = "force-dynamic";

/**
 * GET /api/today/plan → the Today "attention" feed: the user's accepted items + upcoming calendar
 * events, scored and bucketed deterministically (no LLM, no date maths in a model). Returns an
 * AttentionFeed. Nothing is persisted; `now` is anchored server-side so scoring is reproducible.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const feed = await loadAttention(supabase, new Date());
    return NextResponse.json(feed);
  } catch (err) {
    const m = err instanceof Error ? err.message : "Could not build your feed.";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
