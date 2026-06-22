import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { credentialsEnabled } from "@/lib/crypto/secrets";
import { listCredentials, saveCredential, deleteCredential } from "@/lib/credentials/store";

export const dynamic = "force-dynamic";

/**
 * Per-user site-login vault. GET lists saved logins (username + "saved" flag only, never the password).
 * POST encrypts and saves one. DELETE removes one. The plaintext password is encrypted server-side
 * (AES-256-GCM) before it is stored and is never returned to the client.
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const credentials = await listCredentials(supabase, user.id);
  return NextResponse.json({ enabled: credentialsEnabled(), credentials });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  if (!credentialsEnabled()) {
    return NextResponse.json(
      { error: "Saved logins are off on this server. Set CREDENTIALS_SECRET (run: openssl rand -base64 32) to enable the encrypted vault." },
      { status: 400 },
    );
  }

  let body: { site?: string; username?: string; password?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const site = (body.site ?? "").trim();
  const password = body.password ?? "";
  if (!site) return NextResponse.json({ error: "A site is required (e.g. linkedin.com)." }, { status: 400 });
  if (!password) return NextResponse.json({ error: "A password is required." }, { status: 400 });

  try {
    const { site: saved } = await saveCredential(supabase, user.id, { site, username: body.username, password, label: body.label });
    return NextResponse.json({ ok: true, site: saved });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const site = new URL(request.url).searchParams.get("site");
  if (!site) return NextResponse.json({ error: "site is required." }, { status: 400 });
  try {
    await deleteCredential(supabase, user.id, site);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
