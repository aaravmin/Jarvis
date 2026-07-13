import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode } from "@/lib/notion/oauth";
import { saveNotionConnection } from "@/lib/notion/store";
import { ingestNotion } from "@/lib/notion/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/connect/notion/callback, OAuth redirect target. Verifies the CSRF state cookie, exchanges
 * the code for the user's (non-expiring) token, stores it server-side (RLS-scoped), and runs a
 * best-effort first sync so Today has their notes immediately. Always lands back on /connections
 * with a status query param.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const back = (status: string) => {
    const url = new URL("/connections", request.url);
    url.searchParams.set("notion", status);
    const res = NextResponse.redirect(url);
    res.cookies.set("n_oauth_state", "", { path: "/", maxAge: 0 }); // clear the state cookie
    return res;
  };

  if (oauthError) return back(`error:${oauthError}`);
  if (!code || !state) return back("error:missing_code");

  const cookieState = request.cookies.get("n_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return back("error:state_mismatch");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?redirectTo=/connections", request.url));

  try {
    const tokens = await exchangeCode(code);
    const saved = await saveNotionConnection(supabase, user.id, tokens);
    if (saved.error) return back("error:migration_0023");
    // One-time first sync (best-effort; a failure must never block the redirect - Sync all covers it).
    try {
      await ingestNotion(supabase, user.id);
    } catch {
      // ignore; the Connections card still reports "connected" and the user can sync manually
    }
    return back("connected");
  } catch {
    return back("error:exchange_failed");
  }
}
