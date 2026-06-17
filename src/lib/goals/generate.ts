import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The Claude flows for the goals-anchor system (all forced-tool, structured output, following the
 * existing extract.ts pattern). The model never computes dates and never decides whether an
 * intersection exists (that's deterministic SQL) — it only writes prose: goal titles, link rationales,
 * combined-ask suggestions, and goal-connection guidance.
 */

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({ apiKey });
}
function model(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

async function forceTool<T>(system: string, user: string, tool: { name: string; input_schema: object }): Promise<T | null> {
  const client = getClient();
  const resp = await client.messages.create({
    model: model(),
    max_tokens: MAX_TOKENS,
    system,
    tools: [tool as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: user }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  const block = resp.content.find((b) => b.type === "tool_use" && b.name === tool.name) as
    | Anthropic.ToolUseBlock
    | undefined;
  return block ? (block.input as T) : null;
}

function clamp01(n: unknown): number | undefined {
  if (typeof n !== "number" || Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

export type GoalDigest = { id: string; title: string; description?: string };

// ---- (a) generate goals from freeform context -----------------------------
export type GeneratedGoal = { title: string; description?: string; rationale?: string; confidence?: number };

export async function generateGoalsFromContext(context: string): Promise<GeneratedGoal[]> {
  const out = await forceTool<{ goals?: GeneratedGoal[] }>(
    `You turn a person's freeform context (a note, a paste, a brain-dump) into a small set of clear, durable GOALS — the anchors everything else hangs off. A goal is an outcome they're working toward, e.g. "Build a startup called FinePrint", "Break into quant trading", "Get into a PhD program". Keep them concrete and few (1-6). Never invent goals not implied by the context. No dates.`,
    `Context:\n${context.slice(0, 8000)}\n\nExtract the goals via the tool.`,
    {
      name: "extract_goals",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          goals: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string", description: "Short goal title." },
                description: { type: "string", description: "One sentence on what reaching it means." },
                rationale: { type: "string", description: "Why this is a goal, grounded in the context." },
                confidence: { type: "number" },
              },
              required: ["title"],
            },
          },
        },
        required: ["goals"],
      },
    },
  );
  return (out?.goals ?? [])
    .filter((g) => g.title && g.title.trim())
    .map((g) => ({
      title: g.title.trim(),
      description: g.description?.trim() || undefined,
      rationale: g.rationale?.trim() || undefined,
      confidence: clamp01(g.confidence),
    }));
}

// ---- (b) auto-link an entity to goals -------------------------------------
export type ProposedLink = { goalId: string; rationale?: string; confidence?: number };

export async function proposeGoalLinks(entityFacts: string, goals: GoalDigest[]): Promise<ProposedLink[]> {
  if (!goals.length) return [];
  const digest = goals.map((g) => `- (${g.id}) ${g.title}${g.description ? ` — ${g.description}` : ""}`).join("\n");
  const out = await forceTool<{ links?: { goal_id?: string; rationale?: string; confidence?: number }[] }>(
    `You decide which of the user's GOALS an entity (a person, opportunity, meeting, task, etc.) advances. Only pick goal ids from the supplied list; drop anything that doesn't clearly fit. Give a one-line rationale for each link. Be selective — a weak fit is no link.`,
    `Entity:\n${entityFacts.slice(0, 4000)}\n\nThe user's goals (reference these ids only):\n${digest}\n\nReturn the goal links via the tool.`,
    {
      name: "link_to_goals",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          links: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                goal_id: { type: "string" },
                rationale: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["goal_id"],
            },
          },
        },
        required: ["links"],
      },
    },
  );
  const valid = new Set(goals.map((g) => g.id));
  return (out?.links ?? [])
    .filter((l) => l.goal_id && valid.has(l.goal_id))
    .map((l) => ({ goalId: l.goal_id as string, rationale: l.rationale?.trim() || undefined, confidence: clamp01(l.confidence) }));
}

// ---- (c) combined-ask for an intersection ---------------------------------
export async function generateCombinedAsk(entityFacts: string, goals: GoalDigest[]): Promise<string | null> {
  const digest = goals.map((g) => `- ${g.title}${g.description ? `: ${g.description}` : ""}`).join("\n");
  const out = await forceTool<{ combined_ask?: string }>(
    `This entity advances MULTIPLE of the user's goals at once. Propose a SINGLE, natural way to utilize it for all of them together — e.g. one combined ask to a person that serves both goals — so the user doesn't have to badger them separately for each thing. Be specific and considerate; one short paragraph. No dates.`,
    `Entity:\n${entityFacts.slice(0, 3000)}\n\nThe goals it serves:\n${digest}\n\nWrite the single combined-ask suggestion via the tool.`,
    {
      name: "propose_combined_ask",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: { combined_ask: { type: "string" } },
        required: ["combined_ask"],
      },
    },
  );
  return out?.combined_ask?.trim() || null;
}

// ---- (d) goal-to-goal connection guidance ---------------------------------
export async function generateGoalConnection(
  goalA: GoalDigest,
  goalB: GoalDigest,
  sharedEntities: string[],
): Promise<string | null> {
  const shared = sharedEntities.length ? `Shared entities serving both:\n${sharedEntities.map((s) => `- ${s}`).join("\n")}` : "No shared entities yet.";
  const out = await forceTool<{ rationale?: string }>(
    `You explain how two of the user's goals connect and how to INTERSECT them — leverage work on one to advance the other, or make one ask/relationship serve both. One short, actionable paragraph. No dates.`,
    `Goal A: ${goalA.title}${goalA.description ? ` — ${goalA.description}` : ""}\nGoal B: ${goalB.title}${goalB.description ? ` — ${goalB.description}` : ""}\n${shared}\n\nWrite the connection guidance via the tool.`,
    {
      name: "connect_goals",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: { rationale: { type: "string" } },
        required: ["rationale"],
      },
    },
  );
  return out?.rationale?.trim() || null;
}
