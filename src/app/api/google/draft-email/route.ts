import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { draftEmailFromTemplate } from "@/lib/google/draft-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/google/draft-email, { template: <name|url|id>, to?, context? }. Reads the Drive template
 * and returns a filled { subject, body } draft (draft-only; sending needs the gmail.send write scope).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { template?: string; to?: string; context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const template = (body.template ?? "").trim();
  const context = (body.context ?? "").trim();
  if (!template && !context) {
    return NextResponse.json({ error: "Add a template or some context to draft from." }, { status: 400 });
  }

  try {
    const draft = await draftEmailFromTemplate(supabase, user.id, template || undefined, {
      to: body.to?.trim() || undefined,
      context: context || undefined,
    });
    return NextResponse.json(draft);
  } catch (err) {
    // Pass through our actionable "Reconnect Google…" guidance; otherwise return a generic message so
    // we don't leak Google/Drive internals to the client.
    const raw = err instanceof Error ? err.message : "";
    const message =
      raw.startsWith("Reconnect Google") || raw.startsWith("Google account not connected")
        ? raw
        : "Draft failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
