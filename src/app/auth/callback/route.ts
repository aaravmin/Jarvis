import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profile";

/**
 * OAuth landing route (Google sign-on). Supabase redirects here with a `code` after the user approves;
 * we exchange it for a session cookie, then send a brand-new user to onboarding and a returning user to
 * their dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error_description") || searchParams.get("error");

  if (!oauthError && code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const profile = await loadProfile(supabase);
      const ready = Boolean(profile?.headline || profile?.lookingFor || profile?.level);
      return NextResponse.redirect(new URL(ready ? "/today" : "/onboard", origin));
    }
  }

  const url = new URL("/login", origin);
  url.searchParams.set("error", oauthError ? "Google sign-in was cancelled." : "Could not complete Google sign-in.");
  return NextResponse.redirect(url);
}
