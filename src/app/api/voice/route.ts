import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { synthesizeSpeech } from "@/lib/voice/elevenlabs";

// Server-only; synthesis can take a few seconds for longer answers.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/voice — { text } → audio/mpeg bytes (Jarvis speaking). Auth-gated; the ElevenLabs key
 * never leaves the server. On any failure (no key, outage) returns a JSON error so the client can
 * quietly skip speaking and just show the text answer.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Nothing to speak." }, { status: 400 });

  const result = await synthesizeSpeech(text);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return new NextResponse(result.audio, {
    status: 200,
    headers: {
      "content-type": result.contentType,
      "cache-control": "no-store",
    },
  });
}
