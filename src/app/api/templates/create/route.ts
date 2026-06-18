import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveUserTemplate } from "@/lib/templates/store";

export const dynamic = "force-dynamic";

const MAX_BODY = 50_000; // ~plenty for an email template; guards against a huge paste/upload

/**
 * POST /api/templates/create — save a template the user typed or uploaded ({ name?, subject?, body }).
 * Stored verbatim with source "user" (no scrubbing — the user authored it). Supabase is the system of
 * record (hard rule #1); RLS scopes the row to the signed-in user.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { name?: string; subject?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Add some template text to save." }, { status: 400 });
  if (text.length > MAX_BODY) return NextResponse.json({ error: "That template is too large to save." }, { status: 400 });

  try {
    const saved = await saveUserTemplate(supabase, user.id, { name, subject, body: text });
    return NextResponse.json({ ok: true, ...saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the template." },
      { status: 500 },
    );
  }
}
