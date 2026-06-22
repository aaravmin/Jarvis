import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runLinkedInScrape } from "@/lib/agents/linkedin/run";
import type { LinkedInScrapeInput } from "@/lib/agents/linkedin/types";

// Drives a real, logged-in browser to a LinkedIn People search, local, headed, can take 20-40s.
// Server-side only; the LinkedIn session lives in an on-disk Chromium profile, never the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/linkedin/contacts, find relevant LinkedIn people for a linked job/grant and land them in
 * the Review queue as suggested contacts. Body: { applicationId?, opportunityId?, org?, role?, query?,
 * limit? }. Read-only on LinkedIn: it never connects, messages, or logs in for the user, if no session
 * exists it returns needsLogin and leaves the login window open (autonomy L0).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: LinkedInScrapeInput;
  try {
    body = (await request.json()) as LinkedInScrapeInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await runLinkedInScrape(supabase, user.id, {
      applicationId: body.applicationId?.toString().trim() || null,
      opportunityId: body.opportunityId?.toString().trim() || null,
      org: body.org?.toString().trim() || null,
      role: body.role?.toString().trim() || null,
      query: body.query?.toString().trim() || null,
      limit: typeof body.limit === "number" ? body.limit : null,
    });
    // Always 200, the body carries the user-facing message (incl. needsLogin / unavailable states).
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { ok: false, needsLogin: false, found: 0, inserted: 0, skipped: 0, message: (err as Error).message },
      { status: 500 },
    );
  }
}
