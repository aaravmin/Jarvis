import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secrets";

/**
 * The per-user site-login vault. Passwords are encrypted (AES-256-GCM) before they ever reach the
 * database and are only decrypted server-side, at the moment the browser automation needs to sign in.
 * The client never receives a decrypted password: list views return the username and a "saved" flag
 * only. Every query is RLS-scoped to the signed-in user.
 */

export type SiteCredentialView = {
  site: string;
  label: string | null;
  username: string | null;
  hasSecret: boolean;
  updatedAt: string;
};

/** Normalize any site input to a bare host key, e.g. "https://www.linkedin.com/in" -> "linkedin.com". */
export function siteKey(input: string): string {
  const s = (input || "").trim().toLowerCase();
  if (!s) return s;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return s.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export async function listCredentials(supabase: SupabaseClient, userId: string): Promise<SiteCredentialView[]> {
  const { data } = await supabase
    .from("site_credentials")
    .select("site, label, username, secret_enc, updated_at")
    .eq("user_id", userId)
    .order("site");
  return (data ?? []).map((r) => ({
    site: r.site as string,
    label: (r.label as string | null) ?? null,
    username: (r.username as string | null) ?? null,
    hasSecret: Boolean(r.secret_enc),
    updatedAt: r.updated_at as string,
  }));
}

export async function saveCredential(
  supabase: SupabaseClient,
  userId: string,
  input: { site: string; username?: string; password: string; label?: string },
): Promise<{ site: string }> {
  const site = siteKey(input.site);
  if (!site) throw new Error("A site is required.");
  if (!input.password) throw new Error("A password is required.");
  const secret_enc = encryptSecret(input.password);
  const { error } = await supabase.from("site_credentials").upsert(
    {
      user_id: userId,
      site,
      label: input.label?.trim() || null,
      username: input.username?.trim() || null,
      secret_enc,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,site" },
  );
  if (error) throw new Error(error.message);
  return { site };
}

export async function deleteCredential(supabase: SupabaseClient, userId: string, site: string): Promise<void> {
  const { error } = await supabase.from("site_credentials").delete().eq("user_id", userId).eq("site", siteKey(site));
  if (error) throw new Error(error.message);
}

/**
 * Server-only: fetch and decrypt the saved login for a site, for the browser auto-login. Returns null
 * when there is no saved login or the key cannot decrypt it. Never call this from anything that returns
 * to the client.
 */
export async function getCredentialForSite(
  supabase: SupabaseClient,
  userId: string,
  site: string,
): Promise<{ username: string | null; password: string } | null> {
  const { data } = await supabase
    .from("site_credentials")
    .select("username, secret_enc")
    .eq("user_id", userId)
    .eq("site", siteKey(site))
    .maybeSingle();
  if (!data?.secret_enc) return null;
  try {
    return { username: (data.username as string | null) ?? null, password: decryptSecret(data.secret_enc as string) };
  } catch {
    return null;
  }
}
