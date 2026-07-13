import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-confirmation landing route. Supabase emails a link to here with a `token_hash` + `type`;
 * we verify it server-side, which sets the session cookie, then send the user to their home.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only allow same-origin, root-relative redirects, block off-origin "//evil.com" and "/\evil.com".
  const rawNext = searchParams.get("next") ?? "/today";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\")
      ? rawNext
      : "/today";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const url = new URL("/login", request.url);
  url.searchParams.set("error", "Email link is invalid or has expired.");
  return NextResponse.redirect(url);
}
