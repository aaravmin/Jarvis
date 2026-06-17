import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runOpportunitySearch } from "@/lib/agents/opportunity/run";
import type { OpportunityKindFilter } from "@/lib/agents/opportunity/types";

// The Claude web_search call can take 30-90s. Run it server-side; tokens never touch the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID_FILTERS: OpportunityKindFilter[] = ["all", "programs", "jobs", "hackathons"];

/**
 * POST /api/opportunities — start (and, in v1, run to completion) an opportunity search.
 * Body: { query: string, kindFilter?: 'all'|'programs'|'jobs'|'hackathons' }.
 * Returns the finished OpportunityRunView (or a reused in-flight run).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { query?: string; kindFilter?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (query.length < 4) {
    return NextResponse.json({ error: "Describe what to find (a few words at least)." }, { status: 400 });
  }
  const kindFilter = (VALID_FILTERS as string[]).includes(body.kindFilter ?? "")
    ? (body.kindFilter as OpportunityKindFilter)
    : "all";

  const result = await runOpportunitySearch(supabase, user.id, query, kindFilter);
  if (result.status === "reused") {
    return NextResponse.json({ runId: result.runId, status: "running", reused: true });
  }
  if (result.status === "error") {
    return NextResponse.json({ runId: result.runId, status: "error", error: result.error }, { status: 500 });
  }
  return NextResponse.json(result.view);
}
