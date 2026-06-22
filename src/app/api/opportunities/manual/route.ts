import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveDeadline } from "@/lib/agents/opportunity/deadline";
import type { OpportunityCategory } from "@/lib/agents/opportunity/types";

export const dynamic = "force-dynamic";

const CATEGORIES: OpportunityCategory[] = [
  "program", "job", "internship", "hackathon", "fellowship",
  "grant", "scholarship", "competition", "accelerator", "other",
];

/**
 * POST /api/opportunities/manual, manually add an opportunity with rich fields. Body fields below.
 * The deadline is chrono-resolved (hard rule #2). User-created → accepted (no provenance needed).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let b: {
    title?: string; organization?: string; category?: string; description?: string;
    location?: string; isRemote?: boolean; howToApplyUrl?: string; requirements?: string;
    requiredSkills?: string; compOrPrize?: string; rawDeadline?: string; rawEventDates?: string;
  };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const title = (b.title ?? "").trim();
  if (title.length < 2) return NextResponse.json({ error: "Title is required." }, { status: 400 });

  const category = (CATEGORIES as string[]).includes(b.category ?? "") ? (b.category as OpportunityCategory) : "other";
  const skills = (b.requiredSkills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 24);
  const deadlineAt = resolveDeadline(b.rawDeadline, new Date().toISOString());

  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      user_id: user.id,
      title,
      organization: b.organization?.trim() || null,
      category,
      description: b.description?.trim() || null,
      location: b.location?.trim() || null,
      is_remote: typeof b.isRemote === "boolean" ? b.isRemote : null,
      how_to_apply_url: b.howToApplyUrl?.trim() || null,
      requirements: b.requirements?.trim() || null,
      required_skills: skills.length ? skills : null,
      comp_or_prize: b.compOrPrize?.trim() || null,
      raw_deadline: b.rawDeadline?.trim() || null,
      deadline_at: deadlineAt ?? null,
      raw_event_dates: b.rawEventDates?.trim() || null,
      review_status: "accepted",
      created_by: "user",
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not add." }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
