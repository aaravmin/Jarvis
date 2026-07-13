import "server-only";

/**
 * Google OAuth 2.0 helpers (server-only). Per hard rule #6 we use the NARROWEST scopes: Jarvis only
 * READS your email and calendar to derive tasks and follow-ups; it never writes to Google. Tokens are
 * never exposed to the browser, these run in route handlers and are stored server-side via store.ts.
 *
 * NOTE: when this list changes the user must RECONNECT Google (the consent screen re-grants scopes;
 * `prompt=consent` forces it).
 */

export const SCOPE_GMAIL_READONLY = "https://www.googleapis.com/auth/gmail.readonly";
export const SCOPE_CALENDAR_READONLY = "https://www.googleapis.com/auth/calendar.readonly";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  SCOPE_GMAIL_READONLY,
  SCOPE_CALENDAR_READONLY,
];

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export type GoogleTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresInSec: number;
  scope: string;
};

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set in .env.local.");
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set in .env.local.");
  return v;
}

/** The redirect URI, must EXACTLY match an Authorized redirect URI in the Google OAuth client. */
export function redirectUri(): string {
  if (process.env.GOOGLE_OAUTH_REDIRECT) return process.env.GOOGLE_OAUTH_REDIRECT;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/connect/google/callback`;
}

/** Build the consent-screen URL. `access_type=offline` + `prompt=consent` so we get a refresh token. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresInSec: j.expires_in,
    scope: j.scope,
  };
}

/** Mint a fresh access token from a stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
  return {
    accessToken: j.access_token,
    refreshToken, // refresh tokens are not re-issued on refresh; keep the existing one
    expiresInSec: j.expires_in,
    scope: j.scope ?? "",
  };
}

/** Look up the connected account's identity (sub + email) for display + dedup. */
export async function fetchUserinfo(accessToken: string): Promise<{ sub?: string; email?: string }> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  const j = (await res.json()) as { sub?: string; email?: string };
  return { sub: j.sub, email: j.email };
}
