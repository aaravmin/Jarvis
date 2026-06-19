import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApplicationRunView, ApplicationKind, ApplicationRunStatus, FieldPlanItem } from "./types";

/** Read recent application runs for the Apply screen (RLS scopes to the user). */

const COLS =
  "id, target_url, kind, title, organization, resume_id, status, field_plan, unfilled_count, summary, error, created_at";

type Row = {
  id: string;
  target_url: string;
  kind: ApplicationKind;
  title: string | null;
  organization: string | null;
  resume_id: string | null;
  status: ApplicationRunStatus;
  field_plan: FieldPlanItem[] | null;
  unfilled_count: number | null;
  summary: string | null;
  error: string | null;
  created_at: string;
};

function toView(r: Row): ApplicationRunView {
  return {
    id: r.id,
    targetUrl: r.target_url,
    kind: r.kind,
    title: r.title ?? undefined,
    organization: r.organization ?? undefined,
    resumeId: r.resume_id ?? undefined,
    status: r.status,
    fieldPlan: r.field_plan ?? [],
    unfilledCount: r.unfilled_count ?? 0,
    summary: r.summary ?? undefined,
    error: r.error ?? undefined,
    createdAt: r.created_at,
  };
}

export async function listApplicationRuns(
  supabase: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<ApplicationRunView[]> {
  const { data } = await supabase
    .from("application_runs")
    .select(COLS)
    .eq("user_id", userId)
    .neq("status", "running")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as Row[] | null) ?? []).map(toView);
}
