import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rowToOpportunity, OPPORTUNITY_COLS, type OpportunityRow } from "@/lib/agents/opportunity/map";
import type { OpportunityRunView, OpportunityKindFilter } from "@/lib/agents/opportunity/types";

export const dynamic = "force-dynamic";

/** GET /api/opportunities/[runId], load a run and its discovered opportunities (RLS-scoped). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: run } = await supabase
    .from("opportunity_runs")
    .select("id, query, kind_filter, status, result_count, error, created_at")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const { data: opps } = await supabase
    .from("opportunities")
    .select(OPPORTUNITY_COLS)
    .eq("opportunity_run_id", runId)
    .in("review_status", ["review", "accepted"]) // never resurface a dismissed item
    .order("created_at", { ascending: true });
  const rows = (opps ?? []) as unknown as OpportunityRow[];

  const view: OpportunityRunView = {
    id: run.id,
    query: run.query,
    kindFilter: run.kind_filter as OpportunityKindFilter,
    status: run.status,
    resultCount: run.result_count,
    error: run.error ?? undefined,
    createdAt: run.created_at,
    opportunities: rows.map(rowToOpportunity),
  };
  return NextResponse.json(view);
}

/**
 * PATCH /api/opportunities/[runId], review actions.
 * Body: { action: 'accept'|'dismiss', opportunityId } | { action: 'accept-all'|'dismiss-all' } |
 *       { action: 'cancel' }.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { action?: string; opportunityId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;

  if (action === "cancel") {
    await supabase
      .from("opportunity_runs")
      .update({ status: "error", error: "Cancelled by user." })
      .eq("id", runId)
      .eq("status", "running");
    return NextResponse.json({ ok: true });
  }

  if (action === "accept" || action === "dismiss") {
    if (!body.opportunityId) {
      return NextResponse.json({ error: "opportunityId is required." }, { status: 400 });
    }
    const next = action === "accept" ? "accepted" : "dismissed";
    const { error } = await supabase
      .from("opportunities")
      .update({ review_status: next })
      .eq("id", body.opportunityId)
      .eq("opportunity_run_id", runId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reviewStatus: next });
  }

  if (action === "accept-all" || action === "dismiss-all") {
    const next = action === "accept-all" ? "accepted" : "dismissed";
    const { error } = await supabase
      .from("opportunities")
      .update({ review_status: next })
      .eq("opportunity_run_id", runId)
      .eq("review_status", "review");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reviewStatus: next });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
