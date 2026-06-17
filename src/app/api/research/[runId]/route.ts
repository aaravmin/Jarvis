import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rowsToPerson, type ContactRow, type ChannelRow, type GoalLinkRow } from "@/lib/research/map";
import type { ResearchRunView } from "@/lib/research/types";

export const dynamic = "force-dynamic";

const CONTACT_COLS =
  "id, full_name, company, role_title, background, relevance, the_ask, notes, source_quote, confidence, review_status, field_sources";

/** GET /api/research/[runId] — load a run and its discovered people (RLS-scoped). */
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: run } = await supabase
    .from("research_runs")
    .select("id, query, target_kind, status, result_count, error, created_at")
    .eq("id", runId)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const { data: contacts } = await supabase
    .from("contacts")
    .select(CONTACT_COLS)
    .eq("research_run_id", runId)
    // Never resurface a dismissed person (mirrors the review/accepted reads + dismiss-privacy).
    .in("review_status", ["review", "accepted"])
    .order("created_at", { ascending: true });
  const contactRows = (contacts ?? []) as unknown as ContactRow[];
  const ids = contactRows.map((c) => c.id);

  let channels: ChannelRow[] = [];
  let goalLinks: GoalLinkRow[] = [];
  if (ids.length) {
    const { data: ch } = await supabase
      .from("contact_channels")
      .select("contact_id, kind, value, is_primary")
      .in("contact_id", ids);
    channels = (ch ?? []) as unknown as ChannelRow[];
    const { data: gl } = await supabase
      .from("contact_goals")
      .select("contact_id, goal_id, rationale, confidence")
      .in("contact_id", ids);
    goalLinks = (gl ?? []) as unknown as GoalLinkRow[];
  }

  const view: ResearchRunView = {
    id: run.id,
    query: run.query,
    targetKind: "people",
    status: run.status,
    resultCount: run.result_count,
    error: run.error ?? undefined,
    createdAt: run.created_at,
    people: contactRows.map((c) => rowsToPerson(c, channels, goalLinks)),
  };
  return NextResponse.json(view);
}

/**
 * PATCH /api/research/[runId] — review actions.
 * Body: { action: 'accept'|'dismiss', contactId } | { action: 'accept-all'|'dismiss-all' } |
 *       { action: 'cancel' }.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { action?: string; contactId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;

  if (action === "cancel") {
    await supabase
      .from("research_runs")
      .update({ status: "error", error: "Cancelled by user." })
      .eq("id", runId)
      .eq("status", "running");
    return NextResponse.json({ ok: true });
  }

  if (action === "accept" || action === "dismiss") {
    if (!body.contactId) {
      return NextResponse.json({ error: "contactId is required." }, { status: 400 });
    }
    const next = action === "accept" ? "accepted" : "dismissed";
    const { error } = await supabase
      .from("contacts")
      .update({ review_status: next })
      .eq("id", body.contactId)
      .eq("research_run_id", runId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Privacy: on dismiss, drop the unconfirmed third-party contact methods.
    if (action === "dismiss") {
      await supabase.from("contact_channels").delete().eq("contact_id", body.contactId);
    }
    return NextResponse.json({ ok: true, reviewStatus: next });
  }

  if (action === "accept-all" || action === "dismiss-all") {
    const next = action === "accept-all" ? "accepted" : "dismissed";
    const { error } = await supabase
      .from("contacts")
      .update({ review_status: next })
      .eq("research_run_id", runId)
      .eq("review_status", "review");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reviewStatus: next });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
