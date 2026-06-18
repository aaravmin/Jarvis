import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/assistant/ask";
import { buildAskDataContext, type AskDataContext } from "@/lib/assistant/data-tools";

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

  // Give the assistant read access to the user's own connected data (Gmail/Calendar/meetings/tasks/
  // contacts/opportunities) so it can answer questions about them. Never let a data hiccup block the
  // answer — fall back to the web/files-only assistant if the context can't be built.
  let dataCtx: AskDataContext | undefined;
  try {
    dataCtx = await buildAskDataContext(supabase);
  } catch {
    dataCtx = undefined;
  }

  try {
    const result = await ask(message, dataCtx);
    return NextResponse.json(result);
  } catch (err) {
    const m = err instanceof Error ? err.message : "Assistant failed.";
    return NextResponse.json({ error: m }, { status: 500 });
  }
}
