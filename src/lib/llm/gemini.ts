import "server-only";
import {
  grokStructured,
  grokText,
  grokToolLoop,
  grokModel,
  type GrokMessage,
} from "@/lib/llm/grok";

/**
 * The unified LLM provider, routes EVERY call to xAI Grok (see `grok.ts`).
 *
 * Jarvis standardized on a single model provider (xAI Grok) on 2026-06-19. This module keeps the
 * historical `gemini*` export names and the Gemini `contents`/`parts` request shape because ~10 call
 * sites already speak it (the orb assistant, email extraction, research/opportunity engines, etc.).
 * Rather than rewrite all of them, this file is now a thin ADAPTER: it translates the Gemini-shaped
 * calls into xAI's OpenAI-style `messages` API and delegates to the three Grok primitives. No call hits
 * Google anymore, GEMINI_API_KEY / Vertex are unused. (The file name is a cosmetic leftover; the only
 * real LLM client is `grok.ts`.)
 *
 *   geminiStructured<T>()  → grokStructured()  (forced JSON against a JSON Schema)
 *   geminiText()           → grokText()        (plain prose)
 *   geminiToolLoop()       → grokToolLoop()    (function-calling agent loop)
 *
 * The one bit of real logic here is the contents⇄messages translation. Gemini represents a transcript
 * as `{role:'user'|'model', parts:[{text}|{functionCall}|{functionResponse}]}`; xAI uses OpenAI roles
 * (`user`/`assistant`/`tool`) with `tool_calls` on the assistant turn and `tool_call_id` on each tool
 * reply. We pair the two by emitting a fresh unique id per tool call and dequeuing those ids FIFO when
 * the matching tool responses arrive, exactly the order Gemini emits call-then-response, so a tool-loop
 * transcript survives the round-trip (grok messages → contents → grok messages) used by the research and
 * opportunity engines for their follow-up structured pass.
 *
 * All model output stays UNTRUSTED, the call sites validate, clamp, and re-derive everything (dates are
 * never computed by the model; HARD RULE #2).
 */

// --- Wire types (kept identical so existing call sites and their type imports don't change) ----------

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

export type GeminiFunction = { name: string; description?: string; parameters?: object };

export type ToolLoopResult = {
  text: string;
  contents: GeminiContent[];
  finishReason: string;
  turns: number;
};

/** Same name the call sites log; now reports the active xAI model. */
export function geminiModel(): string {
  return grokModel();
}

// --- contents (Gemini) ⇄ messages (xAI/OpenAI) translation --------------------------------------------

function isText(p: GeminiPart): p is { text: string } {
  return "text" in p;
}
function isCall(p: GeminiPart): p is Extract<GeminiPart, { functionCall: unknown }> {
  return "functionCall" in p;
}
function isResponse(p: GeminiPart): p is Extract<GeminiPart, { functionResponse: unknown }> {
  return "functionResponse" in p;
}

/**
 * Gemini `contents` → xAI `messages`. A `model` turn with functionCalls becomes an assistant message
 * carrying `tool_calls`; the following `user` turn's functionResponses become `tool` messages. Because
 * Gemini emits a call turn then its response turn in order, we mint a fresh id per call, queue it, and
 * dequeue FIFO for the responses, guaranteeing unique ids that pair correctly even if the same function
 * is called twice.
 */
function toMessages(contents: GeminiContent[]): GrokMessage[] {
  const out: GrokMessage[] = [];
  const pendingIds: string[] = [];
  let seq = 0;

  for (const c of contents) {
    const texts = c.parts.filter(isText).map((p) => p.text).filter(Boolean);
    if (c.role === "model") {
      const calls = c.parts.filter(isCall);
      if (calls.length) {
        const tool_calls = calls.map((p) => {
          const id = `call_${seq++}`;
          pendingIds.push(id);
          return {
            id,
            type: "function" as const,
            function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args ?? {}) },
          };
        });
        out.push({ role: "assistant", content: texts.join("\n") || null, tool_calls });
      } else {
        out.push({ role: "assistant", content: texts.join("\n") });
      }
    } else {
      // user turn: tool responses (each must reference the matching tool_call id) then any text
      for (const p of c.parts.filter(isResponse)) {
        const id = pendingIds.shift() ?? `call_${seq++}`;
        out.push({ role: "tool", tool_call_id: id, content: JSON.stringify(p.functionResponse.response ?? {}) });
      }
      if (texts.length) out.push({ role: "user", content: texts.join("\n") });
    }
  }
  return out;
}

/**
 * xAI `messages` → Gemini `contents` (drops the leading system message, which is supplied separately on
 * every call). Used to hand the tool-loop transcript back to callers in the shape they expect; it
 * survives a re-translation by toMessages because order is preserved and tool replies re-pair FIFO.
 */
function toContents(messages: GrokMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.content ?? "" }] });
    } else if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.tool_calls ?? []) {
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments ? (JSON.parse(tc.function.arguments) as Record<string, unknown>) : {};
        } catch {
          args = {};
        }
        parts.push({ functionCall: { name: tc.function.name, args } });
      }
      out.push({ role: "model", parts });
    } else {
      // tool reply
      let response: Record<string, unknown> = {};
      try {
        response = m.content ? (JSON.parse(m.content) as Record<string, unknown>) : {};
      } catch {
        response = { result: m.content ?? "" };
      }
      // The function name is irrelevant downstream (toMessages re-pairs tool replies by order, not name).
      out.push({ role: "user", parts: [{ functionResponse: { name: "tool", response } }] });
    }
  }
  return out;
}

// --- Public primitives (Gemini-shaped, Grok-backed) ---------------------------------------------------

/**
 * Force structured JSON against a JSON Schema. Grok takes JSON Schema natively (no schema conversion),
 * so we pass `opts.schema` straight through. Returns null on any failure (call sites validate anyway).
 * `thinkingBudget` is accepted for call-site compatibility and ignored (Grok manages its own reasoning).
 */
export async function geminiStructured<T>(opts: {
  system: string;
  user?: string;
  contents?: GeminiContent[];
  schema: object;
  maxTokens?: number;
  thinkingBudget?: number;
}): Promise<T | null> {
  return grokStructured<T>({
    system: opts.system,
    user: opts.user,
    messages: opts.contents ? toMessages(opts.contents) : undefined,
    schema: opts.schema,
    maxTokens: opts.maxTokens,
  });
}

/** Plain prose generation (no schema). Returns "" on failure. */
export async function geminiText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  thinkingBudget?: number;
}): Promise<string> {
  return grokText({ system: opts.system, user: opts.user, maxTokens: opts.maxTokens });
}

/**
 * A function-calling agent loop. Delegates to grokToolLoop and translates the transcript both ways so
 * callers keep using Gemini `contents`. The returned `contents` can be passed to a follow-up
 * geminiStructured({contents}) for a validated final pass (the research/opportunity engines do this).
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
  const res = await grokToolLoop({
    system: opts.system,
    messages: toMessages(opts.contents),
    // GeminiFunction and GrokFunction are the same {name, description?, parameters?} shape, and Grok
    // takes JSON-Schema params directly, no conversion needed.
    functions: opts.functions,
    execute: opts.execute,
    maxTurns: opts.maxTurns,
    maxTokens: opts.maxTokens,
  });
  return {
    text: res.text,
    contents: toContents(res.messages),
    finishReason: res.finishReason,
    turns: res.turns,
  };
}
