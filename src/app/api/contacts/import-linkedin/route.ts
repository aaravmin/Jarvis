import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importContactFromLinkedIn } from "@/lib/contacts/import-linkedin";

// Reads a LinkedIn profile (headed, logged-in browser) and/or Apollo — can take 20-40s. Server-side
// only; the LinkedIn session lives in an on-disk Chromium profile, never the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/contacts/import-linkedin — add one contact from a pasted LinkedIn profile URL, enriched
 * from the page + Apollo. Body: { url }. Always 200 on a handled outcome; the body's `message` carries
 * the user-facing result (incl. needsLogin / already-exists / nothing-configured states).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let url = "";
  try {
    const body = (await request.json()) as { url?: unknown };
    url = typeof body.url === "string" ? body.url.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!url) return NextResponse.json({ error: "A LinkedIn profile URL is required." }, { status: 400 });

  try {
    const result = await importContactFromLinkedIn(supabase, user.id, url);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        contactId: null,
        fullName: null,
        alreadyExisted: false,
        needsLogin: false,
        email: null,
        company: null,
        roleTitle: null,
        usedBrowser: false,
        usedApollo: false,
        message: (err as Error).message,
      },
      { status: 500 },
    );
  }
}
