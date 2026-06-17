import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  backs,
  clamp01,
  harvestCitations,
  type Citation,
} from "@/lib/agents/citation-gate";
import type { OpportunityCategory, OpportunityKindFilter } from "@/lib/agents/opportunity/types";

/**
 * The Opportunity research engine. Given a natural-language query, it asks Claude to find REAL
 * programs / jobs / hackathons / fellowships via web search, then VALIDATES every claim against the
 * web_search tool's own citation objects before anything is returned for persistence (hard rule #3).
 *
 * Dates (hard rule #2): the model is forbidden from computing or resolving a date. It returns only
 * the VERBATIM string it saw (raw_deadline, raw_event_dates). Our code (deadline.ts) resolves those
 * to timestamps deterministically with chrono-node — never here, never the model.
 */

const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 8 } as const;

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_PAUSE_CONTINUATIONS = 6;
const MAX_TOKENS = 8000;
// The structured report carries many opportunities each with verbatim quotes; give it room so a
// truncated tool input never silently drops results.
const REPORT_MAX_TOKENS = 16000;

const VALID_CATEGORIES: OpportunityCategory[] = [
  "program", "job", "internship", "hackathon", "fellowship",
  "grant", "scholarship", "competition", "accelerator", "other",
];

/** Raw shape the model returns via report_opportunities. Untrusted until validated. */
type RawOpportunity = {
  title: string;
  organization?: string;
  category?: string;
  description?: string;
  location?: string;
  is_remote?: boolean;
  how_to_apply_url?: string;
  requirements?: string;
  required_skills?: string[];
  comp_or_prize?: string;
  raw_deadline?: string;
  raw_event_dates?: string;
  notes?: string;
  source_quote: string;
  match_confidence?: number;
  field_sources?: Record<string, { url?: string; quote?: string; confidence?: number }>;
};

/** Validated opportunity (post-gate, pre-date-resolution). Dates are still raw strings here. */
export type ValidatedOpportunity = {
  title: string;
  organization?: string;
  category: OpportunityCategory;
  description?: string;
  location?: string;
  isRemote?: boolean;
  howToApplyUrl?: string;
  requirements?: string;
  requiredSkills: string[];
  compOrPrize?: string;
  rawDeadline?: string;
  rawEventDates?: string;
  notes?: string;
  sourceQuote: string;
  sourceUrl?: string;
  confidence?: number;
  fieldSources: Record<string, { url?: string; quote?: string; confidence?: number }>;
};

const SYSTEM = `You are Jarvis's opportunity-research agent. Find REAL, currently-open opportunities — programs, jobs, internships, hackathons, fellowships, grants, scholarships, competitions, accelerators — that match the user's request, using web search.

Rules:
1. Every opportunity must be justified by a web search result you actually retrieved. Quote the EXACT short sentence (<= ~150 characters) that proves it matches — verbatim, never paraphrased.
2. Only assert a fact (deadline text, location, requirements, how-to-apply link, prize/comp) if a search result supports it. Never guess or invent an application link.
3. NEVER compute, resolve, or normalize a date. Copy the deadline/date text EXACTLY as written on the source into raw_deadline / raw_event_dates (e.g. "Applications due March 15, 2026", "Rolling", "Feb 7–9"). Do not output ISO dates or "days left".
4. Prefer precision over recall: omit anything you cannot verify rather than guessing.
5. Put uncertainty in plain language (closed/expired ambiguity, low confidence) into notes.`;

const REPORT_TOOL = {
  name: "report_opportunities",
  description:
    "Report the opportunities that match the request. Every claim MUST be backed by a web_search citation you actually retrieved. source_quote is the EXACT verbatim snippet that proves this opportunity matches — never a paraphrase. For dates, copy the VERBATIM text into raw_deadline / raw_event_dates; NEVER compute or resolve a date. Omit any field you cannot back with a citation.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      opportunities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            organization: { type: "string" },
            category: {
              type: "string",
              enum: VALID_CATEGORIES,
              description: "Best-fit bucket for this opportunity.",
            },
            description: { type: "string", description: "1-2 sentences on what it is." },
            location: { type: "string", description: 'e.g. "Remote", "San Francisco, CA", "Hybrid — NYC".' },
            is_remote: { type: "boolean" },
            how_to_apply_url: { type: "string", description: "The application or details URL." },
            requirements: { type: "string", description: "Eligibility / who can apply." },
            required_skills: {
              type: "array",
              items: { type: "string" },
              description: "Programming languages / skills required, e.g. Python, React, Solidity.",
            },
            comp_or_prize: { type: "string", description: "Salary range / stipend / prize pool, verbatim." },
            raw_deadline: {
              type: "string",
              description: 'VERBATIM deadline text from the source. NEVER a computed date. e.g. "Applications due March 15, 2026" or "Rolling".',
            },
            raw_event_dates: {
              type: "string",
              description: 'VERBATIM event/start date text. NEVER computed. e.g. "Hackathon runs Feb 7–9, 2026".',
            },
            notes: { type: "string" },
            source_quote: { type: "string" },
            match_confidence: { type: "number" },
            field_sources: { type: "object" },
          },
          required: ["title", "source_quote", "match_confidence"],
        },
      },
    },
    required: ["opportunities"],
  },
};

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. The opportunity engine runs server-side and needs it in .env.local.",
    );
  }
  return new Anthropic({ apiKey });
}

function normalizeCategory(c?: string): OpportunityCategory {
  const v = (c ?? "").toLowerCase().trim();
  return (VALID_CATEGORIES as string[]).includes(v) ? (v as OpportunityCategory) : "other";
}

/** Plain-language hint that biases the search toward the buckets the user asked for. */
function kindGuidance(kind: OpportunityKindFilter): string {
  switch (kind) {
    case "programs":
      return "Focus on programs, fellowships, accelerators, and scholarships.";
    case "jobs":
      return "Focus on jobs and internships.";
    case "hackathons":
      return "Focus on hackathons and competitions.";
    default:
      return "Include any relevant type: programs, jobs, internships, hackathons, fellowships, grants, scholarships, competitions, accelerators.";
  }
}

/** The validation gate. Returns null to DROP an unprovenanced opportunity. */
function validate(raw: RawOpportunity, citations: Citation[], urls: Set<string>): ValidatedOpportunity | null {
  const backing = citations.find((c) => backs(c.citedText, raw.source_quote));
  if (!raw.title || !backing) return null; // no real quote -> can't legitimately exist

  const notes: string[] = raw.notes ? [raw.notes.trim()] : [];

  // Per-field provenance: keep only sources pointing at a real citation URL (and matching the cited
  // text when a quote is given). Persist the REAL citation text, not the model's prose.
  const fieldSources: Record<string, { url?: string; quote?: string; confidence?: number }> = {};
  for (const [field, fs] of Object.entries(raw.field_sources ?? {})) {
    const urlOk = !!fs.url && urls.has(fs.url);
    const fieldCite =
      fs.quote && fs.url
        ? citations.find((c) => c.url === fs.url && backs(c.citedText, fs.quote!))
        : undefined;
    const quoteOk = fs.quote ? !!fieldCite : urlOk;
    if (urlOk && quoteOk) {
      fieldSources[field] = {
        url: fs.url,
        quote: fieldCite ? fieldCite.citedText.trim() : undefined,
        confidence: clamp01(fs.confidence),
      };
    } else {
      notes.push(`${field}: source unverified`);
    }
  }

  // The apply link is a load-bearing claim: keep it, but only treat it as verified if it (or its host)
  // appeared in the real search results. An unverified link is flagged rather than silently trusted.
  const howToApplyUrl = raw.how_to_apply_url?.trim() || undefined;
  if (howToApplyUrl) {
    const verified = urls.has(howToApplyUrl) || [...urls].some((u) => sameHost(u, howToApplyUrl!));
    if (!verified) notes.push("apply link unverified");
  }

  const requiredSkills = (raw.required_skills ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0 && s.length <= 40)
    .slice(0, 24);

  return {
    title: raw.title.trim(),
    organization: raw.organization?.trim() || undefined,
    category: normalizeCategory(raw.category),
    description: raw.description?.trim() || undefined,
    location: raw.location?.trim() || undefined,
    isRemote: typeof raw.is_remote === "boolean" ? raw.is_remote : undefined,
    howToApplyUrl,
    requirements: raw.requirements?.trim() || undefined,
    requiredSkills,
    compOrPrize: raw.comp_or_prize?.trim() || undefined,
    // Raw date strings pass through UNRESOLVED — chrono resolves them later, never the model.
    rawDeadline: raw.raw_deadline?.trim() || undefined,
    rawEventDates: raw.raw_event_dates?.trim() || undefined,
    notes: notes.length ? notes.join(" · ") : undefined,
    // Persist the REAL cited text from the backing citation, never the model's (untrusted) prose.
    sourceQuote: backing.citedText.trim() || raw.source_quote.trim(),
    sourceUrl: backing.url,
    confidence: clamp01(raw.match_confidence),
    fieldSources,
  };
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

function buildSummary(query: string, opps: ValidatedOpportunity[], citationCount: number): string {
  return [
    `Opportunity search for: "${query}"`,
    `Verified ${opps.length} ${opps.length === 1 ? "opportunity" : "opportunities"} against ${citationCount} web citations.`,
    "",
    ...opps.map((o) => `• ${o.title}${o.organization ? ` — ${o.organization}` : ""}: “${o.sourceQuote}”`),
  ].join("\n");
}

export type OpportunityOutcome = {
  opportunities: ValidatedOpportunity[];
  summary: string;
  citationCount: number;
};

/** Run the two-phase search: (1) web search, (2) force a structured, validated report. */
export async function runOpportunityResearch(
  query: string,
  kindFilter: OpportunityKindFilter = "all",
  seedHints?: string[],
): Promise<OpportunityOutcome> {
  const client = getClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const seedBlock =
    seedHints && seedHints.length
      ? `\n\nCandidate sources to investigate first (from a preliminary search — verify each yourself, do not trust them blindly):\n${seedHints
          .slice(0, 8)
          .map((s) => `- ${s}`)
          .join("\n")}`
      : "";

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Find opportunities matching: ${query}

${kindGuidance(kindFilter)}

Search the web and identify real, currently-open opportunities. For each, quote the exact short sentence from a source that proves it matches, and copy any deadline/date text VERBATIM (never resolve it to a date).${seedBlock}`,
    },
  ];

  const collected: unknown[] = [];
  const searchParams = {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [WEB_SEARCH_TOOL],
    messages,
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  let resp = await client.messages.create(searchParams);
  collected.push(...resp.content);

  let guard = 0;
  while (resp.stop_reason === "pause_turn" && guard++ < MAX_PAUSE_CONTINUATIONS) {
    messages.push({ role: "assistant", content: resp.content });
    resp = await client.messages.create({
      ...searchParams,
      messages,
    } as Anthropic.MessageCreateParamsNonStreaming);
    collected.push(...resp.content);
  }

  const { citations, urls } = harvestCitations(collected);

  // Phase 2 — force the structured report. Citations are already harvested from phase 1.
  const phase2Messages: Anthropic.MessageParam[] = [
    ...messages,
    { role: "assistant", content: resp.content },
    {
      role: "user",
      content:
        "Now call report_opportunities with every qualifying opportunity. Each source_quote must be copied verbatim from a search result you cited above. Copy deadline/date text verbatim into raw_deadline / raw_event_dates — never resolve a date. Omit any field you cannot back with a citation.",
    },
  ];

  const reportParams = {
    model,
    max_tokens: REPORT_MAX_TOKENS,
    // web_search stays declared so the replayed phase-1 history validates; tool_choice forces the
    // report so no new search runs.
    tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_opportunities" },
    messages: phase2Messages,
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const structured = await client.messages.create(reportParams);
  const toolBlock = structured.content.find(
    (b) => b.type === "tool_use" && b.name === "report_opportunities",
  ) as Anthropic.ToolUseBlock | undefined;

  // A missing report block is NOT an empty result — distinguish refusal / truncation / pause so the
  // run finalizes as an error rather than a misleading "0 verified matches".
  if (!toolBlock) {
    if (structured.stop_reason === "max_tokens") {
      throw new Error("Opportunity report was truncated (max_tokens) before it completed.");
    }
    if (structured.stop_reason === "refusal") {
      throw new Error("The model declined to produce an opportunity report for this query.");
    }
    throw new Error(
      `Opportunity search produced no structured report (stop_reason=${structured.stop_reason ?? "unknown"}).`,
    );
  }

  const rawOpps: RawOpportunity[] =
    (toolBlock.input as { opportunities?: RawOpportunity[] } | undefined)?.opportunities ?? [];

  const opportunities = rawOpps
    .map((r) => validate(r, citations, urls))
    .filter((o): o is ValidatedOpportunity => o !== null);

  return {
    opportunities,
    summary: buildSummary(query, opportunities, citations.length),
    citationCount: citations.length,
  };
}
