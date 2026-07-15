import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, notionOAuthConfigured } from "@/lib/notion/oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/connect/notion, start the OAuth flow. Requires a signed-in user (so the callback knows
 * whose token to store). Sets a short-lived httpOnly state cookie for CSRF, then redirects to
 * Notion's consent screen where the user picks the pages Otto may read.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?redirectTo=/connections", request.url));
  }
  if (!notionOAuthConfigured()) {
    return NextResponse.redirect(new URL("/connections?notion=error:not_configured", request.url));
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("n_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 min
  });
  return res;
}
