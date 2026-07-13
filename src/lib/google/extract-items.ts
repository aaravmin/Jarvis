import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { geminiStructured } from "@/lib/llm/gemini";
import { resolveDeadline } from "@/lib/dates";
import { backs, clamp01, norm } from "@/lib/agents/citation-gate";
import { loadGoalDigests } from "@/lib/goals/facts";
import { linkEntityToGoal } from "@/lib/goals/links";
import type { GoalDigest } from "@/lib/goals/generate";

/**
 * Email / meeting / Notion → items extraction (roadmap B1), the engine that turns ingested material
 * into tracked work.
 *
 * For each source we ask the model for genuine commitments the USER must act on (a task, a
 * meeting/event, or a follow-up they owe). The model returns, per candidate, a VERBATIM `source_quote`
 * and a literal `raw_due` phrase, it NEVER computes a date (hard rule #2) and its quote is UNTRUSTED
 * (hard rule #3). Our code then:
 *   1. verifies the quote is actually present in the source (citation gate, drop it otherwise),
 *   2. resolves `raw_due` deterministically with chrono, anchored to when the source occurred,
 *   3. stores the item with source_id + source_quote + confidence at status='review' (L0, rule #5).
 *
 * GOAL RELEVANCE (LLM proposes, CODE verifies): the model may also flag which of the user's GOALS an
 * item advances (by number) with a verbatim `goal_quote`. We accept that link ONLY if the quote passes
 * the same citation gate and the index maps to a real goal, then insert a goal_links row at
 * review_status='review'. Approving the item in the Review queue also accepts the link (one approval).
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
  goal_index?: number;
  goal_quote?: string;
};

const EXTRACT_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      description: "Genuine commitments for the user. Empty if the source is purely informational.",
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
            description: "The EXACT sentence(s) from the source that justify this item, copied verbatim. Never paraphrase.",
          },
          raw_due: {
            type: "string",
            description: "The literal date/time PHRASE from the source if any ('by Friday', 'March 3', 'end of week'). Copy it verbatim; do NOT compute or convert a date. Empty string if none.",
          },
          confidence: { type: "number", description: "0..1, how sure this is a real action item for the user." },
          reasoning: { type: "string", description: "One short sentence: why this is on the user's plate." },
          goal_index: {
            type: "number",
            description: "OPTIONAL. 1-based number of the user's GOAL this item clearly advances (from the numbered GOALS list). Omit unless the fit is clear.",
          },
          goal_quote: {
            type: "string",
            description: "OPTIONAL. Verbatim sentence(s) from the source that show the goal relevance, copied exactly like source_quote. Required if goal_index is set; omit otherwise.",
          },
        },
        required: ["item_type", "title", "source_quote"],
      },
    },
  },
  required: ["items"],
};

export type SourceKind = "email" | "meeting" | "notion";

function nounFor(kind: SourceKind): string {
  if (kind === "meeting") return "meeting transcript";
  if (kind === "notion") return "Notion page / meeting notes";
  return "email";
}

function systemFor(kind: SourceKind, hasGoals: boolean): string {
  const noun = nounFor(kind);
  const owner = kind === "email" ? "the RECIPIENT" : "the user (the person this task manager belongs to)";
  const skip =
    kind === "email"
      ? "newsletters, FYI/announcements, receipts, marketing, or things the SENDER will do"
      : "small talk, recaps of what was already done, or action items assigned to OTHER people";

  const goalBlock = hasGoals
    ? `

GOAL RELEVANCE (optional):
- The user's GOALS are listed (numbered) in the message. If an item CLEARLY advances one of them, set
  goal_index to that goal's number and goal_quote to the EXACT sentence(s) from the ${noun} that show
  the relevance (verbatim, same rule as source_quote). A weak or generic fit is NO link, omit both.`
    : "";

  return `You extract action items from a single ${noun} for a busy person's task manager.

Return ONLY genuine commitments ${owner} must act on:
- task: something the user has to do ("send the form", "review the doc", "register by Friday").
- event: a meeting, call, interview, or hard deadline tied to a date/time.
- follow_up: the user owes someone a reply or a promised thing.

Do NOT extract: ${skip}.
If the ${noun} has nothing actionable for the user, return an empty list, that is a common case.

CRITICAL RULES:
- source_quote MUST be copied verbatim from the ${noun}. Do not paraphrase, summarize, or invent.
- raw_due MUST be the literal phrase as written ("by next Tuesday", "March 3rd", "EOD"). NEVER compute,
  convert, or guess an actual date, our system resolves dates itself. Empty string if no date is stated.
- Be conservative: a wrong task is worse than a missed one. Set confidence honestly (0..1).${goalBlock}`;
}

function userMessage(
  kind: SourceKind,
  source: { title: string | null; body: string },
  goals: GoalDigest[],
): string {
  const head =
    kind === "meeting"
      ? `Meeting: ${source.title ?? "(untitled)"}\n\nTranscript:\n${source.body}`
      : kind === "notion"
        ? `Notion page: ${source.title ?? "(untitled)"}\n\nContent:\n${source.body}`
        : `Email subject: ${source.title ?? "(no subject)"}\n\nEmail body:\n${source.body}`;

  if (!goals.length) return head;
  const list = goals.map((g, i) => `${i + 1}. ${g.title}${g.description ? ` - ${g.description}` : ""}`).join("\n");
  return `${head}\n\nThe user's GOALS (reference by number for goal_index):\n${list}`;
}

const MAX_TITLE = 200;
const MIN_CONFIDENCE = 0.35; // below this it isn't worth putting in the user's face

export type ExtractResult = { inserted: number; considered: number };

// One validated candidate ready to insert, plus any goal link the model proposed and our code verified.
type Prepared = {
  row: Record<string, unknown>;
  normTitle: string;
  goalLink: { goalId: string; quote: string; confidence: number } | null;
};

/**
 * Extract action items from one already-stored source and insert any survivors as review-queue items.
 * Best-effort: returns counts and never throws (a bad source must not abort a whole ingest). `goals`
 * may be passed in (loaded once by the batch runner) or is loaded here for direct single-source calls.
 */
export async function extractItemsFromSource(
  supabase: SupabaseClient,
  userId: string,
  source: { id: string; title: string | null; body: string; occurredAt: string | null },
  kind: SourceKind = "email",
  goals?: GoalDigest[],
): Promise<ExtractResult> {
  const corpus = `${source.title ?? ""}\n${source.body ?? ""}`.trim();
  if (corpus.length < 20) return { inserted: 0, considered: 0 };

  const goalList = goals ?? (await loadGoalDigests(supabase));

  let out: { items?: RawCandidate[] } | null = null;
  try {
    out = await geminiStructured<{ items?: RawCandidate[] }>({
      system: systemFor(kind, goalList.length > 0),
      user: userMessage(kind, source, goalList),
      schema: EXTRACT_SCHEMA,
      maxTokens: 2000,
    });
  } catch {
    return { inserted: 0, considered: 0 }; // model/transport failure, skip this source, keep ingesting
  }

  const candidates = (out?.items ?? []).filter((c): c is RawCandidate => !!c);
  if (!candidates.length) return { inserted: 0, considered: 0 };

  // Don't re-insert items we already derived from this same source (guards manual re-extraction).
  const { data: existing } = await supabase.from("items").select("title").eq("source_id", source.id);
  const seenTitles = new Set((existing ?? []).map((r) => norm(String(r.title ?? ""))));

  const prepared: Prepared[] = [];
  for (const c of candidates) {
    const itemType = ITEM_TYPES.includes(c.item_type as ExtractItemType) ? (c.item_type as ExtractItemType) : "task";
    const title = (c.title ?? "").trim().slice(0, MAX_TITLE);
    const quote = (c.source_quote ?? "").trim();
    if (title.length < 3 || !quote) continue;

    // Hard rule #3: the quote is untrusted, keep the item ONLY if it's actually in the source.
    if (!backs(corpus, quote)) continue;

    const confidence = clamp01(c.confidence) ?? 0.5;
    if (confidence < MIN_CONFIDENCE) continue;
    const normTitle = norm(title);
    if (seenTitles.has(normTitle)) continue;
    seenTitles.add(normTitle);

    // Hard rule #2: resolve the date ourselves, anchored to when the source occurred.
    const dueAt = resolveDeadline(c.raw_due, source.occurredAt ?? undefined) ?? null;

    // Goal relevance: accept ONLY if the model's quote is really in the source AND the index is real.
    let goalLink: Prepared["goalLink"] = null;
    if (goalList.length && typeof c.goal_index === "number" && Number.isFinite(c.goal_index)) {
      const g = goalList[Math.round(c.goal_index) - 1];
      const gq = (c.goal_quote ?? "").trim();
      if (g && gq && backs(corpus, gq)) {
        goalLink = { goalId: g.id, quote: gq.slice(0, 2000), confidence };
      }
    }

    prepared.push({
      row: {
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
      },
      normTitle,
      goalLink,
    });
  }

  if (!prepared.length) return { inserted: 0, considered: candidates.length };

  const { data: insertedRows, error } = await supabase
    .from("items")
    .insert(prepared.map((p) => p.row))
    .select("id, title");
  if (error) return { inserted: 0, considered: candidates.length };

  // Correlate inserted ids back to their candidates (titles are unique within this batch, we deduped).
  const idByTitle = new Map<string, string>();
  for (const ir of insertedRows ?? []) idByTitle.set(norm(String(ir.title ?? "")), ir.id as string);

  // Insert each verified goal link as a review-status suggestion (L0, accepted with the item later).
  for (const p of prepared) {
    if (!p.goalLink) continue;
    const itemId = idByTitle.get(p.normTitle);
    if (!itemId) continue;
    try {
      await linkEntityToGoal(supabase, userId, {
        goalId: p.goalLink.goalId,
        entityType: "item",
        entityId: itemId,
        rationale: p.goalLink.quote,
        confidence: p.goalLink.confidence,
        createdBy: "jarvis",
        reviewStatus: "review",
      });
    } catch {
      // A failed goal link must never lose the item, which is already inserted. Skip and move on.
    }
  }

  return { inserted: prepared.length, considered: candidates.length };
}

/** Run extraction over many sources with bounded concurrency; returns the total items inserted. */
export async function extractItemsFromSources(
  supabase: SupabaseClient,
  userId: string,
  sources: { id: string; title: string | null; body: string; occurredAt: string | null }[],
  concurrency = 4,
  kind: SourceKind = "email",
): Promise<number> {
  // Load the goal list once for the whole batch rather than per source.
  const goals = await loadGoalDigests(supabase);
  let total = 0;
  for (let i = 0; i < sources.length; i += concurrency) {
    const batch = sources.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((s) => extractItemsFromSource(supabase, userId, s, kind, goals)));
    total += results.reduce((sum, r) => sum + r.inserted, 0);
  }
  return total;
}
