import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPeopleSearch } from "@/lib/research/run";

// The Claude web_search call can take 30-90s. Run it server-side; tokens never touch the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/research — start (and, in v1, run to completion) a cohort research run.
 * Body: { target: 'people', query: string }. Returns the finished ResearchRunView.
 *
 * The run-and-persist logic lives in @/lib/research/run (runPeopleSearch) so the multi-agent router
 * (/api/agent) can drive the exact same path. v1 is synchronous; the runs table + GET [runId] let it
 * move to a background worker + polling later without changing the client contract.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { target?: string; query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const target = body.target ?? "people";
  const query = (body.query ?? "").trim();
  if (target !== "people") {
    return NextResponse.json({ error: `Unsupported research target: ${target}` }, { status: 400 });
  }
  if (query.length < 4) {
    return NextResponse.json({ error: "Describe who to find (a few words at least)." }, { status: 400 });
  }

  const result = await runPeopleSearch(supabase, user.id, query);
  if (result.status === "reused") {
    return NextResponse.json({ runId: result.runId, status: "running", reused: true });
  }
  if (result.status === "error") {
    return NextResponse.json({ runId: result.runId, status: "error", error: result.error }, { status: 500 });
  }
  return NextResponse.json(result.view);
}
