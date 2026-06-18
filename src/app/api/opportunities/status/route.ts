import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/agents/opportunity/types";

const VALID = new Set<string>(APPLICATION_STATUSES.map((s) => s.value));

/**
 * Set an opportunity's application-pipeline status (not_applied → … → accepted/rejected).
 * User-driven only; RLS scopes the update to the signed-in user's rows.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { opportunityId?: string; applicationStatus?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { opportunityId, applicationStatus } = body;
  if (!opportunityId) {
    return NextResponse.json({ error: "opportunityId is required." }, { status: 400 });
  }
  if (!applicationStatus || !VALID.has(applicationStatus)) {
    return NextResponse.json({ error: "Invalid applicationStatus." }, { status: 400 });
  }

  const { error } = await supabase
    .from("opportunities")
    .update({ application_status: applicationStatus })
    .eq("id", opportunityId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, applicationStatus: applicationStatus as ApplicationStatus });
}
