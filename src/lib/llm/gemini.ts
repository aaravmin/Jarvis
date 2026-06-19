import "server-only";

/**
 * The Gemini provider — Jarvis's runtime LLM. We talk to Google's Generative Language REST API
 * directly (no SDK dependency) so the surface stays small and auditable. Three primitives cover every
 * call site in the app:
 *
 *   1. geminiStructured<T>()  — forced JSON output against a schema (the old "forced tool" pattern).
 *   2. geminiToolLoop()       — a function-calling agent loop (web search + local tools), used by the
 *                               orb assistant and the research engines.
 *   3. geminiText()           — plain prose, no schema.
 *
 * Why Gemini and not Claude: the Anthropic key ran out of quota constantly; Gemini Flash is fast,
 * cheap, and high-quota. The model is configurable via GEMINI_MODEL (default gemini-2.5-flash — a GA
 * model that's reliable under load; gemini-3.5-flash is newer but currently rate-limited/overloaded).
 *
 * Two auth modes, picked at call time (the request body + response shape are identical, so only the
 * URL and headers differ):
 *   • AI Studio (default) — the public Generative Language API, authed with GEMINI_API_KEY.
 *   • Vertex AI            — for orgs that forbid API keys: set GOOGLE_CLOUD_PROJECT (+ optional
 *                            GOOGLE_CLOUD_LOCATION) and authenticate with Application Default
 *                            Credentials (`gcloud auth application-default login`). A bearer token is
 *                            minted from ADC per request (the library caches/refreshes it). Setting
 *                            GOOGLE_CLOUD_PROJECT flips Jarvis to this mode automatically.
 *
 * Robustness: every call retries on transient overload / rate-limit ("high demand", 429/503), which is
 * exactly the failure the switch was meant to dodge. All model output is treated as UNTRUSTED — the
 * call sites validate, clamp, and re-derive everything (dates are never computed by the model).
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_LOCATION = "us-central1";
const MAX_RETRIES = 4;
const RETRY_BACKOFF_MS = [600, 1400, 3000];

export function geminiModel(): string {
  return (process.env.GEMINI_MODEL || "").trim() || DEFAULT_MODEL;
}

// --- Auth: AI Studio API key OR Vertex AI via ADC ---------------------------

function vertexProject(): string {
  return (process.env.GOOGLE_CLOUD_PROJECT || "").trim();
}

function vertexLocation(): string {
  return (process.env.GOOGLE_CLOUD_LOCATION || "").trim() || DEFAULT_LOCATION;
}

/** Vertex mode is on iff a GCP project is configured. */
function vertexMode(): boolean {
  return vertexProject().length > 0;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "No Gemini credentials. Set GEMINI_API_KEY (AI Studio), or GOOGLE_CLOUD_PROJECT + ADC (Vertex AI) for orgs that block API keys. Server-side only.",
    );
  }
  return key;
}

// ADC client is created lazily and cached; the library refreshes the underlying token on its own.
let cachedAuthClient: Promise<import("google-auth-library").AuthClient> | null = null;

async function vertexBearerToken(): Promise<string> {
  if (!cachedAuthClient) {
    cachedAuthClient = (async () => {
      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
      return auth.getClient();
    })();
  }
  try {
    const client = await cachedAuthClient;
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("empty token");
    return token;
  } catch (e) {
    cachedAuthClient = null; // reset so a transient ADC failure can recover on the next call
    throw new Error(
      `Could not obtain Google ADC credentials for Vertex AI (${e instanceof Error ? e.message : "unknown"}). Run \`gcloud auth application-default login\`.`,
    );
  }
}

/** Build the generateContent URL for whichever mode is active. */
function generateUrl(): string {
  if (vertexMode()) {
    const loc = vertexLocation();
    return `https://${loc}-aiplatform.googleapis.com/v1/projects/${vertexProject()}/locations/${loc}/publishers/google/models/${geminiModel()}:generateContent`;
  }
  return `${ENDPOINT}/${geminiModel()}:generateContent?key=${apiKey()}`;
}

// --- Wire types (the subset of the REST API we use) -------------------------

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type GeminiFunction = { name: string; description?: string; parameters?: object };

type GenConfig = {
  maxOutputTokens?: number;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: object;
  thinkingConfig?: { thinkingBudget: number };
};

type GenerateBody = {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
  tools?: { functionDeclarations: GeminiFunction[] }[];
  generationConfig?: GenConfig;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

// --- JSON Schema → Gemini Schema -------------------------------------------

const TYPE_MAP: Record<string, string> = {
  string: "STRING",
  number: "NUMBER",
  integer: "INTEGER",
  boolean: "BOOLEAN",
  array: "ARRAY",
  object: "OBJECT",
};

type JsonSchema = {
  type?: string;
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  [k: string]: unknown;
};

/**
 * Convert one of our JSON Schemas (the `input_schema` objects the call sites already define) into a
 * Gemini `responseSchema`. Gemini's schema dialect is an OpenAPI subset: uppercase types, no
 * `additionalProperties`, and crucially NO free-form objects (an OBJECT must declare its properties).
 * Returns null when the schema can't be represented faithfully (e.g. a free-form map like
 * `field_sources: { type: "object" }`); the caller then falls back to prompt-embedded JSON mode.
 */
export function toGeminiSchema(schema: JsonSchema): object | null {
  const type = schema.type ? TYPE_MAP[schema.type] : undefined;
  if (!type) return null;

  if (type === "OBJECT") {
    const props = schema.properties;
    // A free-form object (no declared properties) is unrepresentable in responseSchema.
    if (!props || Object.keys(props).length === 0) return null;
    const properties: Record<string, object> = {};
    for (const [k, v] of Object.entries(props)) {
      const conv = toGeminiSchema(v);
      if (!conv) return null; // any unrepresentable child poisons the whole schema
      properties[k] = conv;
    }
    const out: Record<string, unknown> = { type, properties };
    if (schema.description) out.description = schema.description;
    if (Array.isArray(schema.required) && schema.required.length) out.required = schema.required;
    return out;
  }

  if (type === "ARRAY") {
    if (!schema.items) return null;
    const items = toGeminiSchema(schema.items);
    if (!items) return null;
    const out: Record<string, unknown> = { type, items };
    if (schema.description) out.description = schema.description;
    return out;
  }

  // Scalar.
  const out: Record<string, unknown> = { type };
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum) && schema.enum.length) out.enum = schema.enum;
  return out;
}

// --- Low-level call with overload/rate-limit retry --------------------------

function isTransient(status: number, body: GeminiResponse | null): boolean {
  if (status === 429 || status === 500 || status === 503) return true;
  const s = body?.error?.status;
  if (s === "UNAVAILABLE" || s === "RESOURCE_EXHAUSTED" || s === "INTERNAL") return true;
  const msg = (body?.error?.message ?? "").toLowerCase();
  return msg.includes("high demand") || msg.includes("overload") || msg.includes("try again");
}

async function generate(body: GenerateBody): Promise<GeminiResponse> {
  const vertex = vertexMode();
  const url = generateUrl();
  let lastErr = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let status = 0;
    let parsed: GeminiResponse | null = null;
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      // Vertex authenticates per request with an ADC bearer token; AI Studio uses the ?key= in the URL.
      if (vertex) headers.authorization = `Bearer ${await vertexBearerToken()}`;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      status = res.status;
      parsed = (await res.json().catch(() => null)) as GeminiResponse | null;
      if (res.ok && parsed && !parsed.error) return parsed;
      lastErr = parsed?.error?.message ?? `HTTP ${status}`;
    } catch (e) {
      status = 0;
      lastErr = e instanceof Error ? e.message : "network error";
    }
    // Retry transient failures with backoff; otherwise fail fast.
    if (attempt < MAX_RETRIES && (status === 0 || isTransient(status, parsed))) {
      const wait = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)];
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    break;
  }
  throw new Error(`Gemini request failed: ${lastErr}`);
}

function textOf(resp: GeminiResponse): string {
  const parts = resp.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => ("text" in p ? p.text : ""))
    .join("")
    .trim();
}

// --- Public primitives ------------------------------------------------------

/**
 * Force structured JSON out of Gemini against a JSON Schema. Drop-in replacement for the old
 * "forced tool call" pattern. When the schema is cleanly convertible we use a hard responseSchema;
 * otherwise we fall back to JSON mode with the schema embedded in the prompt. Returns null on any
 * failure (blocked, truncated, unparseable) so callers can degrade gracefully — they all validate the
 * shape themselves anyway. Thinking is disabled by default (these are extraction/classification tasks).
 */
export async function geminiStructured<T>(opts: {
  system: string;
  user?: string;
  contents?: GeminiContent[];
  schema: object;
  maxTokens?: number;
  thinkingBudget?: number;
}): Promise<T | null> {
  const responseSchema = toGeminiSchema(opts.schema as JsonSchema);
  const schemaHint = responseSchema
    ? ""
    : `\n\nRespond with ONLY a single JSON object (no prose, no markdown) matching this JSON Schema:\n${JSON.stringify(opts.schema)}`;

  const contents: GeminiContent[] = [...(opts.contents ?? [])];
  if (opts.user || schemaHint) {
    contents.push({ role: "user", parts: [{ text: `${opts.user ?? ""}${schemaHint}` }] });
  }

  const generationConfig: GenConfig = {
    maxOutputTokens: opts.maxTokens ?? 4000,
    responseMimeType: "application/json",
    thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
  };
  if (responseSchema) generationConfig.responseSchema = responseSchema;

  let resp: GeminiResponse;
  try {
    resp = await generate({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      generationConfig,
    });
  } catch {
    return null;
  }

  const raw = textOf(resp);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Salvage a JSON object embedded in stray prose (rare with JSON mode, but cheap insurance).
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
export async function geminiText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  thinkingBudget?: number;
}): Promise<string> {
  try {
    const resp = await generate({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 2000,
        thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
      },
    });
    return textOf(resp);
  } catch {
    return "";
  }
}

export type ToolLoopResult = {
  text: string;
  contents: GeminiContent[];
  finishReason: string;
  turns: number;
};

/**
 * A function-calling agent loop. The model may call any declared function; `execute` runs it
 * (server-side) and its return value is fed back as a functionResponse, until the model stops calling
 * tools and produces a text answer (or we hit maxTurns). Returns the final text plus the full
 * `contents` transcript so a caller can run a follow-up structured pass over the same context (the
 * research engines do this: search, then force a validated report).
 */
export async function geminiToolLoop(opts: {
  system: string;
  contents: GeminiContent[];
  functions: GeminiFunction[];
  execute: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  maxTurns?: number;
  maxTokens?: number;
  thinkingBudget?: number;
}): Promise<ToolLoopResult> {
  const maxTurns = opts.maxTurns ?? 8;
  const contents: GeminiContent[] = [...opts.contents];
  // Call sites declare tool params as ordinary JSON Schema; convert each to Gemini's dialect here.
  const functionDeclarations = opts.functions.map((f) => ({
    name: f.name,
    description: f.description,
    parameters: f.parameters ? (toGeminiSchema(f.parameters as JsonSchema) ?? undefined) : undefined,
  }));
  const tools = [{ functionDeclarations }];
  let finishReason = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await generate({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents,
      tools,
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 8000,
        thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
      },
    });
    finishReason = resp.candidates?.[0]?.finishReason ?? "";
    const parts = resp.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter(
      (p): p is Extract<GeminiPart, { functionCall: unknown }> => "functionCall" in p,
    );

    if (!calls.length) {
      return { text: textOf(resp), contents, finishReason, turns: turn + 1 };
    }

    // Echo the model's tool-calling turn, then answer EVERY call (Gemini requires a response per call).
    contents.push({ role: "model", parts });
    const responseParts: GeminiPart[] = [];
    for (const c of calls) {
      let result: Record<string, unknown>;
      try {
        result = await opts.execute(c.functionCall.name, c.functionCall.args ?? {});
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "tool failed" };
      }
      responseParts.push({ functionResponse: { name: c.functionCall.name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return { text: "", contents, finishReason: finishReason || "max_turns", turns: maxTurns };
}
