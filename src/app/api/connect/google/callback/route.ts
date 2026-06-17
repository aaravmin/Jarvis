import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, fetchUserinfo } from "@/lib/google/oauth";
import { saveConnection } from "@/lib/google/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/connect/google/callback — OAuth redirect target. Verifies the CSRF state cookie, exchanges
 * the code for tokens, looks up the account identity, and stores the tokens server-side (RLS-scoped).
 * Always lands the user back on /connections with a status query param.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const back = (status: string) => {
    const url = new URL("/connections", request.url);
    url.searchParams.set("google", status);
    const res = NextResponse.redirect(url);
    res.cookies.set("g_oauth_state", "", { path: "/", maxAge: 0 }); // clear the state cookie
    return res;
  };

  if (oauthError) return back(`error:${oauthError}`);
  if (!code || !state) return back("error:missing_code");

  const cookieState = request.cookies.get("g_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return back("error:state_mismatch");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?redirectTo=/connections", request.url));

  try {
    const tokens = await exchangeCode(code);
    const identity = await fetchUserinfo(tokens.accessToken);
    await saveConnection(supabase, user.id, tokens, identity);
    return back("connected");
  } catch {
    return back("error:exchange_failed");
  }
}
