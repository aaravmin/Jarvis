import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Sign the user out and bounce them to the login screen. */
export async function POST(request: Request) {
  // CSRF defense-in-depth: this is a state-changing route handler (not a Server Action, which would
  // get Next's built-in Origin check), so reject cross-site POSTs. The sidebar form is same-origin.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host");
    if (new URL(origin).host !== host) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
