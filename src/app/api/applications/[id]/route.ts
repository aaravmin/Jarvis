import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FieldPlanItem } from "@/lib/agents/application/types";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/applications/:id — user actions on a prepared application.
 *   { status: "submitted" }      mark it submitted AFTER the user submits the form themselves.
 *   { fieldPlan: FieldPlanItem[] } save edits the user made to the field values before submitting.
 * The agent itself never sets 'submitted' (submit-only-on-click, hard rule #5).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing application id." }, { status: 400 });

  let body: { status?: string; fieldPlan?: FieldPlanItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status === "submitted" || body.status === "needs_review") update.status = body.status;
  if (Array.isArray(body.fieldPlan)) {
    update.field_plan = body.fieldPlan;
    update.unfilled_count = body.fieldPlan.filter((f) => f.required && !f.filled).length;
  }

  const { error } = await supabase
    .from("application_runs")
    .update(update)
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/applications/:id — discard a prepared application (RLS scopes to the user). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing application id." }, { status: 400 });

  const { error } = await supabase.from("application_runs").delete().eq("user_id", user.id).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
