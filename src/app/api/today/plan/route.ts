import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDayPlan } from "@/lib/agents/today/plan";

// Builds the plan with one Claude call over the day's real data, give it room.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/today/plan → a prioritized, time-ordered plan for today (ephemeral; nothing persisted). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const plan = await buildDayPlan(supabase);
    return NextResponse.json(plan);
  } catch (err) {
    const m = err instanceof Error ? err.message : "Could not build your plan.";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
