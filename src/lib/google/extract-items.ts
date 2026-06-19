import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geminiStructured } from "@/lib/llm/gemini";
import { resolveDeadline } from "@/lib/agents/opportunity/deadline";
import { backs, clamp01, norm } from "@/lib/agents/citation-gate";

/**
 * Email → items extraction (roadmap B1) — the engine that turns ingested mail into tracked work.
 *
 * For each important email we ask the model for genuine commitments the USER must act on (a task, a
 * meeting/event, or a follow-up they owe). The model returns, per candidate, a VERBATIM `source_quote`
 * and a literal `raw_due` phrase — it NEVER computes a date (hard rule #2) and its quote is UNTRUSTED
 * (hard rule #3). Our code then:
 *   1. verifies the quote is actually present in the email body (citation gate — drop it otherwise),
 *   2. resolves `raw_due` deterministically with chrono, anchored to when the email arrived,
 *   3. stores the item with source_id + source_quote + confidence at status='review' (L0, rule #5).
 *
 * The user approves/dismisses each in the Review queue; nothing is ever auto-accepted.
 */

export type ExtractItemType = "task" | "event" | "follow_up";
const ITEM_TYPES: ExtractItemType[] = ["task", "event", "follow_up"];

type RawCandidate = {
  item_type?: string;
  title?: string;
  raw_due?: string;
  source_quote?: string;
  confidence?: number;
  reasoning?: string;
};

const EXTRACT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      description: "Genuine commitments for the user. Empty if the email is purely informational.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item_type: {
            type: "string",
            enum: ITEM_TYPES,
            description: "task = the user must do something; event = a meeting/deadline on a date; follow_up = the user owes someone a reply.",
          },
          title: { type: "string", description: "Short imperative summary, e.g. 'Submit reimbursement form'." },
          source_quote: {
            type: "string",
            description: "The EXACT sentence(s) from the email that justify this item, copied verbatim. Never paraphrase.",
          },
          raw_due: {
            type: "string",
            description: "The literal date/time PHRASE from the email if any ('by Friday', 'March 3', 'end of week'). Copy it verbatim; do NOT compute or convert a date. Empty string if none.",
          },
          confidence: { type: "number", description: "0..1 — how sure this is a real action item for the user." },
          reasoning: { type: "string", description: "One short sentence: why this is on the user's plate." },
        },
        required: ["item_type", "title", "source_quote"],
      },
    },
  },
  required: ["items"],
};

export type SourceKind = "email" | "meeting";

function systemFor(kind: SourceKind): string {
  const noun = kind === "meeting" ? "meeting transcript" : "email";
  const owner = kind === "meeting" ? "the user (the person this task manager belongs to)" : "the RECIPIENT";
  const skip =
    kind === "meeting"
      ? "small talk, recaps of what was already done, or action items assigned to OTHER people"
      : "newsletters, FYI/announcements, receipts, marketing, or things the SENDER will do";
  return `You extract action items from a single ${noun} for a busy person's task manager.

Return ONLY genuine commitments ${owner} must act on:
- task: something the user has to do ("send the form", "review the doc", "register by Friday").
- event: a meeting, call, interview, or hard deadline tied to a date/time.
- follow_up: the user owes someone a reply or a promised thing.

Do NOT extract: ${skip}.
If the ${noun} has nothing actionable for the user, return an empty list — that is a common case.

CRITICAL RULES:
- source_quote MUST be copied verbatim from the ${noun}. Do not paraphrase, summarize, or invent.
- raw_due MUST be the literal phrase as written ("by next Tuesday", "March 3rd", "EOD"). NEVER compute,
  convert, or guess an actual date — our system resolves dates itself. Empty string if no date is stated.
- Be conservative: a wrong task is worse than a missed one. Set confidence honestly (0..1).`;
}

const MAX_TITLE = 200;
const MIN_CONFIDENCE = 0.35; // below this it isn't worth putting in the user's face

export type ExtractResult = { inserted: number; considered: number };

/**
 * Extract action items from one already-stored email source and insert any survivors as review-queue
 * items. Best-effort: returns counts and never throws (a bad email must not abort a whole ingest).
 */
export async function extractItemsFromSource(
  supabase: SupabaseClient,
  userId: string,
  source: { id: string; title: string | null; body: string; occurredAt: string | null },
  kind: SourceKind = "email",
): Promise<ExtractResult> {
  const corpus = `${source.title ?? ""}\n${source.body ?? ""}`.trim();
  if (corpus.length < 20) return { inserted: 0, considered: 0 };

  const userMsg =
    kind === "meeting"
      ? `Meeting: ${source.title ?? "(untitled)"}\n\nTranscript:\n${source.body}`
      : `Email subject: ${source.title ?? "(no subject)"}\n\nEmail body:\n${source.body}`;

  let out: { items?: RawCandidate[] } | null = null;
  try {
    out = await geminiStructured<{ items?: RawCandidate[] }>({
      system: systemFor(kind),
      user: userMsg,
      schema: EXTRACT_SCHEMA,
      maxTokens: 2000,
    });
  } catch {
    return { inserted: 0, considered: 0 }; // model/transport failure — skip this email, keep ingesting
  }

  const candidates = (out?.items ?? []).filter((c): c is RawCandidate => !!c);
  if (!candidates.length) return { inserted: 0, considered: 0 };

  // Don't re-insert items we already derived from this same email (guards manual re-extraction).
  const { data: existing } = await supabase.from("items").select("title").eq("source_id", source.id);
  const seenTitles = new Set((existing ?? []).map((r) => norm(String(r.title ?? ""))));

  const rows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    const itemType = ITEM_TYPES.includes(c.item_type as ExtractItemType) ? (c.item_type as ExtractItemType) : "task";
    const title = (c.title ?? "").trim().slice(0, MAX_TITLE);
    const quote = (c.source_quote ?? "").trim();
    if (title.length < 3 || !quote) continue;

    // Hard rule #3: the quote is untrusted — keep the item ONLY if it's actually in the email.
    if (!backs(corpus, quote)) continue;

    const confidence = clamp01(c.confidence) ?? 0.5;
    if (confidence < MIN_CONFIDENCE) continue;
    if (seenTitles.has(norm(title))) continue;
    seenTitles.add(norm(title));

    // Hard rule #2: resolve the date ourselves, anchored to when the email arrived.
    const dueAt = resolveDeadline(c.raw_due, source.occurredAt ?? undefined) ?? null;

    rows.push({
      user_id: userId,
      item_type: itemType,
      title,
      due_at: dueAt,
      status: "review",
      confidence,
      source_id: source.id,
      source_quote: quote.slice(0, 2000),
      reasoning: (c.reasoning ?? "").trim().slice(0, 500) || null,
      created_by: "jarvis",
    });
  }

  if (!rows.length) return { inserted: 0, considered: candidates.length };
  const { error } = await supabase.from("items").insert(rows);
  if (error) return { inserted: 0, considered: candidates.length };
  return { inserted: rows.length, considered: candidates.length };
}

/** Run extraction over many sources with bounded concurrency; returns the total items inserted. */
export async function extractItemsFromSources(
  supabase: SupabaseClient,
  userId: string,
  sources: { id: string; title: string | null; body: string; occurredAt: string | null }[],
  concurrency = 4,
  kind: SourceKind = "email",
): Promise<number> {
  let total = 0;
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((s) => extractItemsFromSource(supabase, userId, s, kind)));
    total += results.reduce((sum, r) => sum + r.inserted, 0);
  }
  return total;
}
