import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshAccessToken, type GoogleTokens } from "@/lib/google/oauth";

/**
 * Server-side store for the connected Google account's tokens (hard rule #6). RLS scopes every row to
 * the signed-in user, so the user-scoped Supabase client can only ever touch its own row. The browser
 * never receives these tokens — only server routes/agents call in here.
 */

const TABLE = "connected_accounts";
const EXPIRY_SKEW_MS = 60_000; // refresh a minute before actual expiry

export type GoogleConnection = {
  email?: string;
  scopes: string[];
  connectedAt: string;
};

/** Persist tokens after a successful OAuth exchange (one Google account per user; upsert replaces). */
export async function saveConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: GoogleTokens,
  identity: { sub?: string; email?: string },
): Promise<void> {
  const nowISO = new Date().toISOString();
  const expiresAt = new Date(Date.now() + tokens.expiresInSec * 1000).toISOString();
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      provider: "google",
      google_sub: identity.sub ?? null,
      email: identity.email ?? null,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? null,
      token_expires_at: expiresAt,
      scopes: tokens.scope ? tokens.scope.split(" ") : null,
      updated_at: nowISO,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw new Error(`Could not save Google connection: ${error.message}`);
}

/** The connection summary for the Connections UI (no tokens), or null if not connected. */
export async function getConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<GoogleConnection | null> {
  const { data } = await supabase
    .from(TABLE)
    .select("email, scopes, created_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (!data) return null;
  return { email: data.email ?? undefined, scopes: data.scopes ?? [], connectedAt: data.created_at };
}

/**
 * Return a valid access token, refreshing (and persisting) it if it's expired/near-expiry. Throws a
 * clear error if the user hasn't connected Google or the refresh token is gone (re-consent needed).
 */
export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from(TABLE)
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  if (!data) throw new Error("Google account not connected. Connect it on the Connections page first.");

  const expMs = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0;
  if (data.access_token && expMs - EXPIRY_SKEW_MS > Date.now()) {
    return data.access_token as string;
  }

  if (!data.refresh_token) {
    throw new Error("Google session expired and no refresh token is stored. Reconnect Google.");
  }
  const refreshed = await refreshAccessToken(data.refresh_token as string);
  const expiresAt = new Date(Date.now() + refreshed.expiresInSec * 1000).toISOString();
  await supabase
    .from(TABLE)
    .update({ access_token: refreshed.accessToken, token_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", "google");
  return refreshed.accessToken;
}

/** The scopes Google actually granted on the last connect (used to gate write features). */
export async function getGrantedScopes(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from(TABLE)
    .select("scopes")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle();
  return ((data?.scopes as string[] | null) ?? []).filter(Boolean);
}

/**
 * Return a valid access token but only if a specific scope was granted; otherwise throw a clear
 * "reconnect" error naming the feature. This turns Google's opaque 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT
 * into actionable guidance when the user connected before the write scopes were added.
 */
export async function getTokenWithScope(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  featureLabel: string,
): Promise<string> {
  const scopes = await getGrantedScopes(supabase, userId);
  if (!scopes.includes(scope)) {
    throw new Error(
      `Reconnect Google to enable ${featureLabel}. The required permission isn't granted yet — open Connections and click Reconnect.`,
    );
  }
  return getValidAccessToken(supabase, userId);
}

/** Remove the connection (disconnect). */
export async function disconnect(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from(TABLE).delete().eq("user_id", userId).eq("provider", "google");
}
