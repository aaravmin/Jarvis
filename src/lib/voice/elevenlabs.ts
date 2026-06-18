import "server-only";

/**
 * ElevenLabs text-to-speech — Jarvis's voice. The API key lives ONLY here on the server (hard rule
 * #6: tokens server-side, never in the browser). The client asks /api/voice for audio; this module
 * is the only place that touches the key.
 *
 * Entirely gated on ELEVENLABS_API_KEY. With no key set, elevenLabsEnabled() is false and the route
 * returns 503 so the UI silently falls back to a voiceless (text-only) answer — speaking is a
 * progressive enhancement, never a hard dependency.
 */

const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
// "George — Warm, Captivating Storyteller": one of the default voices present on a fresh (incl. free)
// account, so it works via the API the moment a key is added. NOTE: most *library* voices (e.g.
// "Rachel") return 402 paid_plan_required for free users — that was the original silent-voice bug.
// Override with ELEVENLABS_VOICE_ID to use any voice that appears in YOUR account's voice list.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
// Turbo v2.5: low-latency, good quality — the right default for a snappy assistant reply.
const DEFAULT_MODEL = "eleven_turbo_v2_5";
// Cap the spoken text: long answers would cost a lot and take forever to synthesize. The on-screen
// answer is always the full text; the voice just reads a sensible lead.
const MAX_CHARS = 2500;
const TIMEOUT_MS = 20000;

/** True when an ElevenLabs key is configured. The route and client branch on this. */
export function elevenLabsEnabled(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

export type SpeechResult =
  | { ok: true; audio: ArrayBuffer; contentType: string }
  | { ok: false; status: number; error: string };

/**
 * Synthesize `text` to MP3 audio. Returns the raw bytes (the route streams them back). Never throws —
 * any failure (no key, outage, bad text) comes back as { ok: false } so the caller degrades quietly.
 */
export async function synthesizeSpeech(text: string): Promise<SpeechResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "Voice is not configured (ELEVENLABS_API_KEY is not set)." };
  }
  const clean = (text ?? "").trim().slice(0, MAX_CHARS);
  if (!clean) return { ok: false, status: 400, error: "Nothing to speak." };

  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "").trim() || DEFAULT_VOICE_ID;
  const modelId = (process.env.ELEVENLABS_MODEL || "").trim() || DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: clean,
        model_id: modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // ElevenLabs returns JSON errors; surface a short message without leaking the key.
      const detail = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: shorten(detail) || `Voice request failed (${res.status}).` };
    }
    const audio = await res.arrayBuffer();
    return { ok: true, audio, contentType: res.headers.get("content-type") || "audio/mpeg" };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "Voice request timed out." : "Voice request failed.";
    return { ok: false, status: 502, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function shorten(detail: string): string {
  try {
    const j = JSON.parse(detail) as { detail?: { message?: string } | string };
    const m = typeof j.detail === "string" ? j.detail : j.detail?.message;
    return (m ?? "").slice(0, 200);
  } catch {
    return detail.slice(0, 200);
  }
}
