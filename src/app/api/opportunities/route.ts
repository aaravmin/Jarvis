import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runOpportunitySearch } from "@/lib/agents/opportunity/run";
import { resolveDeadline } from "@/lib/agents/opportunity/deadline";
import type { OpportunityCategory, OpportunityKindFilter } from "@/lib/agents/opportunity/types";

// The Claude web_search call can take 30-90s. Run it server-side; tokens never touch the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID_FILTERS: OpportunityKindFilter[] = ["all", "programs", "jobs", "hackathons"];
const CATEGORIES: OpportunityCategory[] = [
  "program", "job", "internship", "hackathon", "fellowship",
  "grant", "scholarship", "competition", "accelerator", "other",
];

/**
 * POST /api/opportunities, start (and, in v1, run to completion) an opportunity search.
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

/**
 * PATCH /api/opportunities, edit one opportunity's fields inline. Body: { id, ...fields }. Only the
 * provided fields are written (partial update). Editing rawDeadline re-resolves deadline_at with
 * chrono (hard rule #2: the model and the user never set a computed date directly). RLS scopes the
 * write to the caller's own row.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let b: {
    id?: string; title?: string; organization?: string; category?: string; description?: string;
    location?: string; isRemote?: boolean; howToApplyUrl?: string; requirements?: string;
    requiredSkills?: string; compOrPrize?: string; rawDeadline?: string; rawEventDates?: string; notes?: string;
  };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const id = (b.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const text = (v?: string) => (v?.trim() ? v.trim() : null);
  if (b.title !== undefined) {
    const t = (b.title ?? "").trim();
    if (t.length < 2) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    patch.title = t;
  }
  if (b.organization !== undefined) patch.organization = text(b.organization);
  if (b.category !== undefined && (CATEGORIES as string[]).includes(b.category)) patch.category = b.category;
  if (b.description !== undefined) patch.description = text(b.description);
  if (b.location !== undefined) patch.location = text(b.location);
  if (typeof b.isRemote === "boolean") patch.is_remote = b.isRemote;
  if (b.howToApplyUrl !== undefined) patch.how_to_apply_url = text(b.howToApplyUrl);
  if (b.requirements !== undefined) patch.requirements = text(b.requirements);
  if (b.compOrPrize !== undefined) patch.comp_or_prize = text(b.compOrPrize);
  if (b.notes !== undefined) patch.notes = text(b.notes);
  if (b.rawEventDates !== undefined) patch.raw_event_dates = text(b.rawEventDates);
  if (b.requiredSkills !== undefined) {
    const skills = (b.requiredSkills ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 24);
    patch.required_skills = skills.length ? skills : null;
  }
  if (b.rawDeadline !== undefined) {
    patch.raw_deadline = text(b.rawDeadline);
    patch.deadline_at = resolveDeadline(b.rawDeadline, new Date().toISOString()) ?? null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update." }, { status: 400 });

  const { error } = await supabase.from("opportunities").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/opportunities?id=<id>, remove one opportunity. RLS scopes to the caller's own row. */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
