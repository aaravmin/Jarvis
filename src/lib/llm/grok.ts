import "server-only";

/**
 * The Grok provider — the "brain" of the Application & Outreach Agent (xAI's Grok). We talk to xAI's
 * OpenAI-compatible REST API directly (no SDK) so the surface stays small and auditable, exactly like
 * the Gemini provider. Three primitives mirror `gemini.ts` so the agent code reads the same:
 *
 *   1. grokStructured<T>()  — forced JSON output against a JSON Schema (response_format: json_schema).
 *   2. grokToolLoop()       — a function-calling agent loop (web search + page tools).
 *   3. grokText()           — plain prose, no schema.
 *
 * Why Grok and not Gemini for this module: the Application & Outreach Agent needs strong agentic
 * tool-calling / form-reasoning, and the user's org provisions an xAI key (XAI_API_KEY) for it. The
 * existing features keep running on Gemini — this is an additive second backend, not a replacement.
 *
 * Auth: a single bearer key, `XAI_API_KEY` (server-side only). The model is configurable via XAI_MODEL
 * (default grok-4.3 — xAI's current flagship reasoning model as of the May 2026 consolidation; the
 * legacy grok-3* names now redirect to it).
 *
 * Robustness: every call retries on transient overload / rate-limit (429/500/503), with exponential
 * backoff honoring `retry-after` when present. All model output is treated as UNTRUSTED — the call
 * sites validate, clamp, and re-derive everything (dates are never computed by the model; HARD RULE #2).
 */

const BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4.3";
const MAX_RETRIES = 4;
const RETRY_BACKOFF_MS = [600, 1400, 3000];

export function grokModel(): string {
  return (process.env.XAI_MODEL || process.env.GROK_MODEL || "").trim() || DEFAULT_MODEL;
}

function apiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error(
      "No xAI credentials. Set XAI_API_KEY (from console.x.ai) to use the Application & Outreach Agent. Server-side only.",
    );
  }
  return key;
}

// --- Wire types (the subset of the OpenAI-compatible API we use) ------------

export type GrokToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/**
 * One message in the chat transcript. We keep a single permissive shape rather than a union so the
 * tool loop can push assistant tool-call turns and tool-result turns without casting.
 */
export type GrokMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GrokToolCall[];
  tool_call_id?: string;
};

export type GrokFunction = { name: string; description?: string; parameters?: object };

type GrokRequestTool = { type: "function"; function: GrokFunction };

type GrokRequestBody = {
  model: string;
  messages: GrokMessage[];
  max_tokens?: number;
  temperature?: number;
  tools?: GrokRequestTool[];
  tool_choice?: "auto" | "required" | "none";
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; schema: object };
  };
};

type GrokResponse = {
  choices?: Array<{
    message?: { role: string; content: string | null; tool_calls?: GrokToolCall[] };
    finish_reason?: string;
  }>;
  // xAI returns errors as either { error: "msg", code } or { error: { message, code } }.
  error?: string | { message?: string; code?: string | number };
};

// --- Low-level call with overload/rate-limit retry --------------------------

function errorMessage(body: GrokResponse | null, status: number): string {
  const e = body?.error;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && e.message) return e.message;
  return `HTTP ${status}`;
}

/** 429/500/503 (and network failures, signalled by status 0) are worth retrying; 4xx client errors are not. */
function isTransient(status: number): boolean {
  return status === 0 || status === 429 || status === 500 || status === 503;
}

async function complete(body: GrokRequestBody): Promise<GrokResponse> {
  const key = apiKey();
  const url = `${BASE_URL}/chat/completions`;
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let status = 0;
    let parsed: GrokResponse | null = null;
    let retryAfterMs = 0;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      });
      status = res.status;
      const ra = Number(res.headers.get("retry-after"));
      if (Number.isFinite(ra) && ra > 0) retryAfterMs = ra * 1000;
      parsed = (await res.json().catch(() => null)) as GrokResponse | null;
      if (res.ok && parsed && !parsed.error) return parsed;
      lastErr = errorMessage(parsed, status);
    } catch (e) {
      status = 0;
      lastErr = e instanceof Error ? e.message : "network error";
    }
    if (attempt < MAX_RETRIES && isTransient(status)) {
      const backoff = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
      await new Promise((r) => setTimeout(r, Math.max(backoff, retryAfterMs)));
      continue;
    }
    break;
  }
  throw new Error(`Grok request failed: ${lastErr}`);
}

function textOf(resp: GrokResponse): string {
  return (resp.choices?.[0]?.message?.content ?? "").trim();
}

// --- Public primitives ------------------------------------------------------

/**
 * Force structured JSON out of Grok against a JSON Schema (xAI's response_format: json_schema).
 * Mirrors geminiStructured: returns null on any failure (blocked, truncated, unparseable) so callers
 * can degrade gracefully — they all validate the shape themselves anyway. xAI exposes no `strict`
 * flag, so we still salvage-parse and the call sites never trust the output.
 */
export async function grokStructured<T>(opts: {
  system: string;
  user?: string;
  messages?: GrokMessage[];
  schema: object;
  schemaName?: string;
  maxTokens?: number;
}): Promise<T | null> {
  const messages: GrokMessage[] = [{ role: "system", content: opts.system }, ...(opts.messages ?? [])];
  if (opts.user) messages.push({ role: "user", content: opts.user });

  let resp: GrokResponse;
  try {
    resp = await complete({
      model: grokModel(),
      messages,
      max_tokens: opts.maxTokens ?? 4000,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName ?? "result", schema: opts.schema },
      },
    });
  } catch {
    return null;
  }

  const raw = textOf(resp);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Salvage a JSON object embedded in stray prose (cheap insurance).
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Plain prose generation (no schema). Returns "" on failure. */
export async function grokText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  try {
    const resp = await complete({
      model: grokModel(),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_tokens: opts.maxTokens ?? 2000,
      temperature: 0.3,
    });
    return textOf(resp);
  } catch {
    return "";
  }
}

export type GrokToolLoopResult = {
  text: string;
  messages: GrokMessage[];
  finishReason: string;
  turns: number;
};

/**
 * A function-calling agent loop. The model may call any declared function; `execute` runs it
 * (server-side) and its return value is fed back as a `tool` message, until the model stops calling
 * tools and produces a text answer (or we hit maxTurns). Returns the final text plus the full
 * `messages` transcript so a caller can run a follow-up structured pass over the same context (the
 * Application & Outreach agent does this: research/fill, then force a validated plan).
 */
export async function grokToolLoop(opts: {
  system: string;
  messages: GrokMessage[];
  functions: GrokFunction[];
  execute: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  maxTurns?: number;
  maxTokens?: number;
}): Promise<GrokToolLoopResult> {
  const maxTurns = opts.maxTurns ?? 8;
  const messages: GrokMessage[] = [{ role: "system", content: opts.system }, ...opts.messages];
  const tools: GrokRequestTool[] = opts.functions.map((f) => ({ type: "function", function: f }));
  let finishReason = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await complete({
      model: grokModel(),
      messages,
      tools,
      tool_choice: "auto",
      max_tokens: opts.maxTokens ?? 8000,
      temperature: 0,
    });
    const choice = resp.choices?.[0];
    finishReason = choice?.finish_reason ?? "";
    const msg = choice?.message;
    const calls = msg?.tool_calls ?? [];

    if (!calls.length) {
      return { text: (msg?.content ?? "").trim(), messages, finishReason, turns: turn + 1 };
    }

    // Echo the model's tool-calling turn, then answer EVERY call (one tool message per call id).
    messages.push({ role: "assistant", content: msg?.content ?? null, tool_calls: calls });
    for (const c of calls) {
      let result: Record<string, unknown>;
      try {
        const args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
        result = await opts.execute(c.function.name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "tool failed" };
      }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }

  return { text: "", messages, finishReason: finishReason || "max_turns", turns: maxTurns };
}
