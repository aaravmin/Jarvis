import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractItemsFromSource } from "@/lib/google/extract-items";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // a transcript extraction is one LLM call

const MAX_TRANSCRIPT = 30_000;

/**
 * POST /api/meetings/extract, paste a meeting transcript, store it as a `meeting` source, and mine it
 * for action items (reusing the email→items engine). Items land at status='review' (L0 suggest-only),
 * each carrying source_id + a verbatim source_quote + confidence (hard rules #3/#5). Dates in the
 * transcript are resolved by chrono against the meeting time, never by the model (hard rule #2).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { title?: string; transcript?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const transcript = (body.transcript ?? "").trim();
  if (transcript.length < 20) {
    return NextResponse.json({ error: "Paste a longer transcript so GOTT has something to read." }, { status: 400 });
  }
  if (transcript.length > MAX_TRANSCRIPT) {
    return NextResponse.json({ error: "That transcript is too long, trim it under 30k characters." }, { status: 400 });
  }
  const title = (body.title ?? "").trim() || "Meeting";
  const occurredAt = new Date().toISOString();

  const { data: src, error: srcErr } = await supabase
    .from("sources")
    .insert({
      user_id: user.id,
      source_type: "meeting",
      title,
      occurred_at: occurredAt,
      raw_text: transcript,
    })
    .select("id")
    .single();
  if (srcErr || !src) {
    return NextResponse.json({ error: srcErr?.message ?? "Could not save the transcript." }, { status: 500 });
  }

  const result = await extractItemsFromSource(
    supabase,
    user.id,
    { id: src.id, title, body: transcript, occurredAt },
    "meeting",
  );

  return NextResponse.json({ ok: true, sourceId: src.id, inserted: result.inserted });
}
