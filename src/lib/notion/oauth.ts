import "server-only";

/**
 * Notion OAuth 2.0 helpers (server-only), mirroring lib/google/oauth.ts. A PUBLIC Notion integration
 * (client id + secret) lets ANY user of this deployment connect their own Notion: the consent screen
 * asks them to pick the pages Otto may read, and the resulting token is stored per-user (RLS).
 * Otto only ever READS Notion (hard rule #1). Notion access tokens do not expire, so there is no
 * refresh flow.
 */

const AUTH_ENDPOINT = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_ENDPOINT = "https://api.notion.com/v1/oauth/token";

export function notionOAuthConfigured(): boolean {
  return !!(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET);
}

function clientId(): string {
  const v = process.env.NOTION_CLIENT_ID;
  if (!v) throw new Error("NOTION_CLIENT_ID is not set in .env.local.");
  return v;
}
function clientSecret(): string {
  const v = process.env.NOTION_CLIENT_SECRET;
  if (!v) throw new Error("NOTION_CLIENT_SECRET is not set in .env.local.");
  return v;
}

/** The redirect URI, must EXACTLY match a redirect URI on the Notion integration. */
export function redirectUri(): string {
  if (process.env.NOTION_OAUTH_REDIRECT) return process.env.NOTION_OAUTH_REDIRECT;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/connect/notion/callback`;
}

/** Build the consent-screen URL. `owner=user` = a user-scoped grant where they pick pages. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    owner: "user",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type NotionTokens = {
  accessToken: string;
  botId?: string;
  workspaceName?: string;
};

/** Exchange an authorization code for a (non-expiring) access token. Notion uses HTTP Basic auth. */
export async function exchangeCode(code: string): Promise<NotionTokens> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`Notion token exchange failed (${res.status}): ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; bot_id?: string; workspace_name?: string };
  return { accessToken: j.access_token, botId: j.bot_id, workspaceName: j.workspace_name ?? undefined };
}
