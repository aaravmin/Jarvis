import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scrapeForm } from "./scrape";
import { resolveFields, type MaterialsBundle } from "./resolve";
import { countUnfilled, type ApplicationKind, type ApplicationRunResult, type ApplicationRunView, type FieldPlanItem } from "./types";
import { loadAgentMaterials } from "@/lib/documents/store";
import { loadProfile, profileDigest } from "@/lib/profile";

/**
 * Run-and-persist for the Application agent. Owns the full flow so the page and the agent router share
 * one path: dedup guard → create run → read the form (eyes) → load the user's materials (memory) →
 * ground each field with Grok (brain) → persist the field_plan for review.
 *
 * It NEVER submits (hard rule #5): the run lands status='needs_review' for the user to check and submit.
 * Synchronous v1 like the Opportunity agent; the runs table + inflight index let it move to a worker.
 */

const STALE_MS = 120_000;

/** Pull the opportunity's context (when launched from a card) so the resolver knows the role/program. */
async function opportunityContext(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string,
): Promise<{ context?: string; title?: string; organization?: string }> {
  const { data } = await supabase
    .from("opportunities")
    .select("title, organization, category, description, requirements")
    .eq("user_id", userId)
    .eq("id", opportunityId)
    .maybeSingle();
  if (!data) return {};
  const context = [
    data.title && `Title: ${data.title}`,
    data.organization && `Organization: ${data.organization}`,
    data.category && `Category: ${data.category}`,
    data.description && `Description: ${data.description}`,
    data.requirements && `Requirements: ${data.requirements}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { context: context || undefined, title: data.title ?? undefined, organization: data.organization ?? undefined };
}

function buildSummary(opts: {
  via: "browser" | "static";
  fieldCount: number;
  filled: number;
  unfilled: number;
  empty: boolean;
  resumeName?: string;
  notes: string;
}): string {
  if (opts.empty) {
    return "Couldn't read a fillable form on that page automatically, it may be built with JavaScript. Open the link and apply manually; your materials are ready below.";
  }
  const lines = [
    `Read ${opts.fieldCount} field${opts.fieldCount === 1 ? "" : "s"} from the form (${opts.via === "browser" ? "rendered" : "static"} read).`,
    `Grounded ${opts.filled} from your materials${opts.resumeName ? ` (resume: ${opts.resumeName})` : ""}.`,
    opts.unfilled > 0
      ? `${opts.unfilled} required field${opts.unfilled === 1 ? "" : "s"} still need you before submitting.`
      : "Every required field is grounded, review and submit.",
  ];
  if (opts.notes) lines.push(opts.notes);
  return lines.join(" ");
}

function toView(row: {
  id: string;
  target_url: string;
  kind: ApplicationKind;
  title: string | null;
  organization: string | null;
  resume_id: string | null;
  status: ApplicationRunView["status"];
  field_plan: FieldPlanItem[];
  unfilled_count: number;
  summary: string | null;
  error: string | null;
  created_at: string;
}): ApplicationRunView {
  return {
    id: row.id,
    targetUrl: row.target_url,
    kind: row.kind,
    title: row.title ?? undefined,
    organization: row.organization ?? undefined,
    resumeId: row.resume_id ?? undefined,
    status: row.status,
    fieldPlan: row.field_plan ?? [],
    unfilledCount: row.unfilled_count ?? 0,
    summary: row.summary ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

export async function runApplication(
  supabase: SupabaseClient,
  userId: string,
  opts: { targetUrl: string; kind?: ApplicationKind; opportunityId?: string },
): Promise<ApplicationRunResult> {
  const targetUrl = opts.targetUrl.trim();
  const kind: ApplicationKind = opts.kind ?? "job";

  // Dedup guard: don't start a second run against the same URL while one is in flight (self-heals stale).
  const { data: existing } = await supabase
    .from("application_runs")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("target_url", targetUrl)
    .eq("status", "running")
    .maybeSingle();
  if (existing) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age < STALE_MS) return { status: "reused", runId: existing.id };
    await supabase
      .from("application_runs")
      .update({ status: "error", error: "Abandoned / timed out." })
      .eq("id", existing.id);
  }

  const { data: run, error: runErr } = await supabase
    .from("application_runs")
    .insert({
      user_id: userId,
      target_url: targetUrl,
      kind,
      opportunity_id: opts.opportunityId ?? null,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !run) {
    if (runErr?.code === "23505") {
      const { data: dup } = await supabase
        .from("application_runs")
        .select("id")
        .eq("user_id", userId)
        .eq("target_url", targetUrl)
        .eq("status", "running")
        .maybeSingle();
      if (dup) return { status: "reused", runId: dup.id };
    }
    throw new Error(runErr?.message ?? "Could not create application run.");
  }
  const runId = run.id as string;

  try {
    const [form, { resume, materials }, profile, oppCtx] = await Promise.all([
      scrapeForm(targetUrl),
      loadAgentMaterials(supabase, userId),
      loadProfile(supabase),
      opts.opportunityId
        ? opportunityContext(supabase, userId, opts.opportunityId)
        : Promise.resolve({} as Awaited<ReturnType<typeof opportunityContext>>),
    ]);

    const bundle: MaterialsBundle = {
      resumeName: resume?.name,
      resumeText: resume?.extractedText,
      documents: materials.map((d) => ({ name: d.name, text: d.extractedText ?? "" })),
      profileDigest: profileDigest(profile) || undefined,
      opportunityContext: oppCtx.context,
    };

    const { plan, notes } = await resolveFields(form.fields, bundle);
    const unfilled = countUnfilled(plan);
    const filled = plan.filter((f) => f.filled).length;

    const summary = buildSummary({
      via: form.via,
      fieldCount: form.fields.length,
      filled,
      unfilled,
      empty: form.empty,
      resumeName: resume?.name,
      notes,
    });

    const { data: updated } = await supabase
      .from("application_runs")
      .update({
        status: "needs_review",
        title: form.title ?? oppCtx.title ?? null,
        organization: form.organization ?? oppCtx.organization ?? null,
        resume_id: resume?.id ?? null,
        field_plan: plan,
        unfilled_count: unfilled,
        summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId)
      .select(
        "id, target_url, kind, title, organization, resume_id, status, field_plan, unfilled_count, summary, error, created_at",
      )
      .single();

    if (!updated) throw new Error("Failed to save the prepared application.");
    return { status: "done", view: toView(updated) };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Preparing the application failed.";
    await supabase.from("application_runs").update({ status: "error", error }).eq("id", runId);
    return { status: "error", runId, error };
  }
}
