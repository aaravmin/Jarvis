import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/assistant/ask";

// Server-only; the agentic loop (web search + local file reads) can take a while.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/ask — { message } → { answer, citations[], files[] }. Auth-gated. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Ask me something." }, { status: 400 });

  try {
    const result = await ask(message);
    return NextResponse.json(result);
  } catch (err) {
    const m = err instanceof Error ? err.message : "Assistant failed.";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
