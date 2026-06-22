import "server-only";
import { geminiToolLoop, geminiStructured } from "@/lib/llm/gemini";
import { webSearch } from "@/lib/search/tavily";
import { backs, clamp01, type Citation } from "@/lib/agents/citation-gate";
import type { OpportunityCategory, OpportunityKindFilter } from "@/lib/agents/opportunity/types";

/**
 * The Opportunity research engine. Given a natural-language query, it asks Gemini to find REAL
 * programs / jobs / hackathons / fellowships via Tavily web search, then VALIDATES every claim against
 * the actual page content Tavily returned before anything is persisted (hard rule #3).
 *
 * Why this is still provenance-safe after the Claude→Gemini switch: the model never browses on its
 * own. Every web result it sees comes from webSearch() (Tavily), and we keep each result's real page
 * text as the citation corpus. A reported source_quote only survives if it's a genuine substring of
 * one of those real pages, exactly the gate the Anthropic citation objects used to provide.
 *
 * Dates (hard rule #2): the model is forbidden from computing or resolving a date. It returns only
 * the VERBATIM string it saw (raw_deadline, raw_event_dates). Our code (deadline.ts) resolves those
 * to timestamps deterministically with chrono-node, never here, never the model.
 */

const WEB_SEARCH_FN = {
  name: "web_search",
  description:
    "Search the public web for real, currently-open opportunities. Returns result pages (title, url, content). Issue focused queries; you may search several times. Only facts present in these results may be reported.",
  parameters: {
    type: "object" as const,
    properties: { query: { type: "string", description: "The search query." } },
    required: ["query"],
  },
};

const MAX_TURNS = 8;
const MAX_TOKENS = 8000;
// The structured report carries many opportunities each with verbatim quotes; give it room so a
// truncated output never silently drops results.
const REPORT_MAX_TOKENS = 16000;
// Per-result page text shown to the model (full text is kept in the citation corpus for validation).
const RESULT_SNIPPET = 1800;

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

const SYSTEM = `You are Jarvis's opportunity-research agent. Find REAL, currently-open opportunities, programs, jobs, internships, hackathons, fellowships, grants, scholarships, competitions, accelerators, that match the user's request, using web search.

Rules:
1. Every opportunity must be justified by a web search result you actually retrieved. Quote the EXACT short sentence (<= ~150 characters) that proves it matches, verbatim, never paraphrased.
2. Only assert a fact (deadline text, location, requirements, how-to-apply link, prize/comp) if a search result supports it. Never guess or invent an application link.
3. NEVER compute, resolve, or normalize a date. Copy the deadline/date text EXACTLY as written on the source into raw_deadline / raw_event_dates (e.g. "Applications due March 15, 2026", "Rolling", "Feb 7-9"). Do not output ISO dates or "days left".
4. Prefer precision over recall: omit anything you cannot verify rather than guessing.
5. Put uncertainty in plain language (closed/expired ambiguity, low confidence) into notes.`;

const REPORT_TOOL = {
  name: "report_opportunities",
  description:
    "Report the opportunities that match the request. Every claim MUST be backed by a web_search citation you actually retrieved. source_quote is the EXACT verbatim snippet that proves this opportunity matches, never a paraphrase. For dates, copy the VERBATIM text into raw_deadline / raw_event_dates; NEVER compute or resolve a date. Omit any field you cannot back with a citation.",
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
            location: { type: "string", description: 'e.g. "Remote", "San Francisco, CA", "Hybrid, NYC".' },
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
              description: 'VERBATIM event/start date text. NEVER computed. e.g. "Hackathon runs Feb 7-9, 2026".',
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
    // Raw date strings pass through UNRESOLVED, chrono resolves them later, never the model.
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
    ...opps.map((o) => `• ${o.title}${o.organization ? `, ${o.organization}` : ""}: “${o.sourceQuote}”`),
  ].join("\n");
}

export type OpportunityOutcome = {
  opportunities: ValidatedOpportunity[];
  summary: string;
  citationCount: number;
};

/** Run the two-phase search: (1) agentic Tavily web search, (2) a structured, validated report. */
export async function runOpportunityResearch(
  query: string,
  kindFilter: OpportunityKindFilter = "all",
  seedHints?: string[],
  relevance?: string,
): Promise<OpportunityOutcome> {
  const relevanceBlock = relevance
    ? `\n\nTune results to THIS person, strongly prefer opportunities that fit their level/age and advance their goals; drop ones that don't (e.g. internships not senior roles for a student; programs open to undergrads, not PhD-only):\n${relevance}`
    : "";

  const seedBlock =
    seedHints && seedHints.length
      ? `\n\nCandidate sources to investigate first (from a preliminary search, verify each yourself, do not trust them blindly):\n${seedHints
          .slice(0, 8)
          .map((s) => `- ${s}`)
          .join("\n")}`
      : "";

  // Citation corpus: every page Tavily returns, kept with its FULL text so a model quote can be
  // validated as a real substring. `searchLog` is a trimmed view shown to the report model.
  const citations: Citation[] = [];
  const urls = new Set<string>();
  const searchLog: string[] = [];
  const seenUrls = new Set<string>();

  async function execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name !== "web_search") return { error: `Unknown tool: ${name}` };
    const q = String(args.query ?? "").trim();
    if (!q) return { results: [] };
    const hits = await webSearch(q, { deep: true, maxResults: 6 });
    for (const h of hits) {
      if (!h.url || seenUrls.has(h.url)) continue;
      seenUrls.add(h.url);
      urls.add(h.url);
      citations.push({ url: h.url, citedText: h.content });
      if (searchLog.length < 40) {
        searchLog.push(`SOURCE: ${h.title}\nURL: ${h.url}\nCONTENT: ${h.content.slice(0, RESULT_SNIPPET)}`);
      }
    }
    return {
      results: hits.map((h) => ({ title: h.title, url: h.url, content: h.content.slice(0, RESULT_SNIPPET) })),
    };
  }

  // Phase 1, let the model drive Tavily searches (it picks the queries; Tavily returns real pages).
  await geminiToolLoop({
    system: SYSTEM,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Find opportunities matching: ${query}

${kindGuidance(kindFilter)}

Search the web (call web_search, possibly several times) and identify real, currently-open opportunities. For each, note the exact short sentence from a result that proves it matches, and copy any deadline/date text VERBATIM (never resolve it to a date).${relevanceBlock}${seedBlock}`,
          },
        ],
      },
    ],
    functions: [WEB_SEARCH_FN],
    execute,
    maxTurns: MAX_TURNS,
    maxTokens: MAX_TOKENS,
  });

  // Phase 2, force a structured report over ONLY the harvested results. Nothing else is in scope, so
  // the model cannot invent a source; validate() then drops anything whose quote/URL isn't backed.
  let rawOpps: RawOpportunity[] = [];
  if (citations.length) {
    const corpus = searchLog.join("\n\n---\n\n");
    const report = await geminiStructured<{ opportunities?: RawOpportunity[] }>({
      system: SYSTEM,
      user: `Original request: ${query}

${kindGuidance(kindFilter)}

Here are the web search results you retrieved. Use ONLY these, do not introduce any other source:

${corpus}

Report every qualifying opportunity. Each source_quote MUST be an exact verbatim substring of one source's CONTENT above (never a paraphrase). Set how_to_apply_url / field_sources urls only to URLs that appear above. Copy deadline/date text VERBATIM into raw_deadline / raw_event_dates, never resolve a date. Omit any field you cannot back.`,
      schema: REPORT_TOOL.input_schema,
      maxTokens: REPORT_MAX_TOKENS,
    });
    rawOpps = report?.opportunities ?? [];
  }

  const opportunities = rawOpps
    .map((r) => validate(r, citations, urls))
    .filter((o): o is ValidatedOpportunity => o !== null);

  return {
    opportunities,
    summary: buildSummary(query, opportunities, citations.length),
    citationCount: citations.length,
  };
}
