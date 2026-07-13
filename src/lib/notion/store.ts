import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotionTokens } from "@/lib/notion/oauth";

/**
 * Per-user Notion connection storage (mirrors lib/google/store.ts). Rows live in connected_accounts
 * with provider='notion' (migration 0023): access_token is the OAuth token (Notion tokens do not
 * expire), google_sub carries the bot_id, email carries the workspace name for display. RLS scopes
 * every row to its owner; the browser never sees a token (hard rule #6).
 *
 * Token resolution order for reads: the user's own OAuth connection, then the deployment-wide
 * NOTION_API_KEY internal-integration token as a SELF-HOST fallback (single-person instances that
 * don't want to create a public OAuth integration). The env key is never used when a user has their
 * own connection.
 */

const TABLE = "connected_accounts";

/** Postgres CHECK violation — migration 0023 (provider 'notion') not applied yet. */
const CHECK_VIOLATION = "23514";

export type NotionConnection = {
  workspaceName?: string;
  connectedAt: string;
};

export async function saveNotionConnection(
  supabase: SupabaseClient,
  userId: string,
  tokens: NotionTokens,
): Promise<{ error?: string }> {
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      provider: "notion",
      google_sub: tokens.botId ?? null,
      email: tokens.workspaceName ?? null,
      access_token: tokens.accessToken,
      refresh_token: null,
      token_expires_at: null,
      scopes: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error?.code === CHECK_VIOLATION) {
    return {
      error:
        "Connecting Notion needs migration 0023_notion_provider.sql applied in the Supabase SQL editor (it allows provider='notion').",
    };
  }
  if (error) return { error: `Could not save the Notion connection: ${error.message}` };
  return {};
}

export async function getNotionConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<NotionConnection | null> {
  const { data } = await supabase
    .from(TABLE)
    .select("email, created_at")
    .eq("user_id", userId)
    .eq("provider", "notion")
    .maybeSingle();
  if (!data) return null;
  return { workspaceName: data.email ?? undefined, connectedAt: data.created_at };
}

export async function deleteNotionConnection(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from(TABLE).delete().eq("user_id", userId).eq("provider", "notion");
}

/** The token to read Notion with for this user: their own connection first, env key as fallback. */
export async function getNotionToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from(TABLE)
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "notion")
    .maybeSingle();
  if (data?.access_token) return data.access_token as string;
  return process.env.NOTION_API_KEY || null;
}

/** Can this user sync Notion right now (own connection or the self-host env fallback)? */
export async function notionAvailable(supabase: SupabaseClient, userId: string): Promise<boolean> {
  return (await getNotionToken(supabase, userId)) !== null;
}
