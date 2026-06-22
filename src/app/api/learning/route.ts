import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveStyleExample } from "@/lib/learning/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/learning, record one edit Jarvis should learn from. Body: { kind, aiText, finalText,
 * context? }. Called when the user keeps an edited version of a generated output. A no-op when the user
 * did not actually change anything. RLS-scoped to the caller.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { kind?: string; aiText?: string; finalText?: string; context?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const kind = (body.kind ?? "").trim();
  if (!kind) return NextResponse.json({ error: "kind is required." }, { status: 400 });

  try {
    await saveStyleExample(supabase, user.id, {
      kind,
      context: body.context,
      aiText: body.aiText ?? "",
      finalText: body.finalText ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
