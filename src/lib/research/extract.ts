import "server-only";
import { geminiToolLoop, geminiStructured } from "@/lib/llm/gemini";
import { webSearch } from "@/lib/search/tavily";

/**
 * The cohort research engine. Given a natural-language query + the user's goals, it asks Gemini to
 * find real people via Tavily web search, then VALIDATES every claim against the actual page content
 * Tavily returned before anything is returned for persistence.
 *
 * The load-bearing rule (hard rule #3): the model's reported URLs and quotes are UNTRUSTED. The model
 * never browses on its own — every page it sees comes from webSearch() (Tavily), and we keep each
 * result's real page text as the citation corpus + a per-run URL allowlist, then:
 *   - DROP any candidate whose source_quote is not a real substring of a retrieved page, and
 *   - null any field/channel source URL not in the allowlist.
 * That makes provenance verifiable rather than cosmetic. Nothing here computes dates.
 */

const WEB_SEARCH_FN = {
  name: "web_search",
  description:
    "Search the public web for real, named people who match the cohort. Returns result pages (title, url, content). Issue focused queries; you may search several times. Only facts present in these results may be reported.",
  parameters: {
    type: "object" as const,
    properties: { query: { type: "string", description: "The search query." } },
    required: ["query"],
  },
};

const MAX_TURNS = 8;
const MAX_TOKENS = 8000;
// Phase 2 (the structured report) needs more room: a cohort of people, each with verbatim quotes
// and channels, can be large, and truncated output would silently drop candidates.
const REPORT_MAX_TOKENS = 16000;
// Per-result page text shown to the model (full text is kept in the citation corpus for validation).
const RESULT_SNIPPET = 1800;

export type GoalDigest = { id: string; title: string };

/** Raw shape the model returns via the report_candidates tool. Treated as untrusted until validated. */
type RawCandidate = {
  full_name: string;
  company?: string;
  role_title?: string;
  background?: string;
  relevance?: string;
  the_ask?: string;
  notes?: string;
  source_quote: string;
  match_confidence?: number;
  channels?: Array<{ kind: string; value: string; confidence?: number; source_url?: string }>;
  goal_links?: Array<{ goal_id: string; rationale?: string; confidence?: number }>;
  field_sources?: Record<string, { url?: string; quote?: string; confidence?: number }>;
};

export type ValidatedCandidate = {
  fullName: string;
  company?: string;
  roleTitle?: string;
  background?: string;
  relevance?: string;
  theAsk?: string;
  notes?: string;
  sourceQuote: string;
  sourceUrl?: string;
  confidence?: number;
  channels: Array<{
    kind: string;
    value: string;
    confidence?: number;
    sourceUrl?: string;
    verified: boolean;
  }>;
  goalLinks: Array<{ goalId: string; rationale?: string; confidence?: number }>;
  fieldSources: Record<string, { url?: string; quote?: string; confidence?: number }>;
};

type Citation = { url: string; citedText: string };

const RESEARCH_SYSTEM = `You are Jarvis's people-research agent. Find REAL, named people who match the user's cohort query, using web search.

Rules:
1. Every person must be justified by a web search result you actually retrieved. When you state a person matches, cite the source and quote the EXACT short sentence (<= ~150 characters) that asserts it — verbatim, never paraphrased or stitched together.
2. Only assert a fact (email, company, role, background) if a search result supports it. Never guess or invent contact information.
3. Never compute or emit any date or "reach out by" value.
4. Prefer precision over recall: omit anyone you cannot verify rather than guessing.
5. Put uncertainty in plain language (same-name ambiguity, low confidence) so it can go into a notes field.`;

const REPORT_TOOL = {
  name: "report_candidates",
  description:
    "Report the people who match the cohort. Every claim MUST be backed by a web_search citation you actually retrieved. source_quote is the EXACT verbatim snippet from a search result that asserts this person matches the cohort — never a paraphrase. Omit any field you cannot back with a citation rather than guessing it. Do NOT include any date, datetime, or follow-up field anywhere.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            full_name: { type: "string" },
            company: { type: "string" },
            role_title: { type: "string" },
            background: { type: "string" },
            relevance: { type: "string" },
            the_ask: { type: "string" },
            notes: { type: "string" },
            source_quote: { type: "string" },
            match_confidence: { type: "number" },
            channels: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  kind: { type: "string" },
                  value: { type: "string" },
                  confidence: { type: "number" },
                  source_url: { type: "string" },
                },
                required: ["kind", "value"],
              },
            },
            goal_links: {
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
            field_sources: { type: "object" },
          },
          required: ["full_name", "source_quote", "match_confidence"],
        },
      },
    },
    required: ["candidates"],
  },
};

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Is `quote` genuinely backed by the real citation `citedText`? Directional on purpose: the quote
 * must be (essentially) a substring OF the citation. We tolerate the ~150-char cited_text truncation
 * by also accepting the reverse direction — but ONLY when the real citation fragment is itself
 * substantial (>= 40 chars), so a short real fragment can never "back" a long model-authored paraphrase.
 */
function backs(citedText: string, quote: string): boolean {
  if (!quote || !citedText) return false;
  const h = norm(citedText);
  const n = norm(quote);
  if (n.length < 12) return false; // too short to be a meaningful, attributable quote
  if (h.includes(n)) return true;
  return n.includes(h) && h.length >= 40;
}

function clamp01(n: unknown): number | undefined {
  if (typeof n !== "number" || Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

/**
 * The validation gate. Returns null to DROP an unprovenanced candidate; otherwise returns a
 * candidate whose every source has been checked against real citations.
 */
function validate(
  raw: RawCandidate,
  citations: Citation[],
  urls: Set<string>,
  goalIds: Set<string>,
): ValidatedCandidate | null {
  const backing = citations.find((c) => backs(c.citedText, raw.source_quote));
  if (!raw.full_name || !backing) return null; // no real quote -> the person cannot legitimately exist

  const notes: string[] = raw.notes ? [raw.notes.trim()] : [];

  // Per-field provenance: keep only sources that point at a real citation URL (and match the
  // cited text when a quote is given). Persist the REAL citation text, not the model's prose.
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

  // Channels: keep the value, but only keep a source URL that is in the allowlist.
  const channels = (raw.channels ?? [])
    .filter((ch) => ch.kind && ch.value)
    .map((ch) => {
      const verified = !!ch.source_url && urls.has(ch.source_url);
      if (ch.source_url && !verified) notes.push(`${ch.kind} (${ch.value}): source unverified`);
      return {
        kind: ch.kind,
        value: ch.value,
        confidence: clamp01(ch.confidence),
        sourceUrl: verified ? ch.source_url : undefined,
        verified,
      };
    });

  // Goal links: only to goals that actually belong to this user (RLS enforces again at write time).
  const goalLinks = (raw.goal_links ?? [])
    .filter((g) => goalIds.has(g.goal_id))
    .map((g) => ({ goalId: g.goal_id, rationale: g.rationale, confidence: clamp01(g.confidence) }));

  return {
    fullName: raw.full_name.trim(),
    company: raw.company?.trim() || undefined,
    roleTitle: raw.role_title?.trim() || undefined,
    background: raw.background?.trim() || undefined,
    relevance: raw.relevance?.trim() || undefined,
    theAsk: raw.the_ask?.trim() || undefined,
    notes: notes.length ? notes.join(" · ") : undefined,
    // Persist the REAL cited text from the backing citation, never the model's (untrusted) prose.
    sourceQuote: backing.citedText.trim() || raw.source_quote.trim(),
    sourceUrl: backing.url,
    confidence: clamp01(raw.match_confidence),
    channels,
    goalLinks,
    fieldSources,
  };
}

function buildSummary(query: string, candidates: ValidatedCandidate[], citationCount: number): string {
  const lines = [
    `Research run for: "${query}"`,
    `Verified ${candidates.length} ${candidates.length === 1 ? "person" : "people"} against ${citationCount} web citations.`,
    "",
    ...candidates.map((c) => `• ${c.fullName}${c.company ? ` — ${c.company}` : ""}: “${c.sourceQuote}”`),
  ];
  return lines.join("\n");
}

export type ResearchOutcome = {
  candidates: ValidatedCandidate[];
  summary: string;
  citationCount: number;
};

/** Run the two-phase research: (1) agentic Tavily web search, (2) a structured, validated report. */
export async function runPeopleResearch(
  query: string,
  goals: GoalDigest[],
): Promise<ResearchOutcome> {
  const goalsDigest = goals.length
    ? goals.map((g) => `- (${g.id}) ${g.title}`).join("\n")
    : "(no goals on file)";

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

  // Phase 1 — let the model drive Tavily searches (it picks the queries; Tavily returns real pages).
  await geminiToolLoop({
    system: RESEARCH_SYSTEM,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Cohort to find: ${query}

The user's goals (reference these ids in goal_links; do not invent ids):
${goalsDigest}

Search the web (call web_search, possibly several times) and identify real, named people who match this cohort. For each person, note the exact short sentence from a result that proves they match.`,
          },
        ],
      },
    ],
    functions: [WEB_SEARCH_FN],
    execute,
    maxTurns: MAX_TURNS,
    maxTokens: MAX_TOKENS,
  });

  // Phase 2 — force a structured report over ONLY the harvested results. Nothing else is in scope, so
  // the model cannot invent a source; validate() then drops anything whose quote/URL isn't backed.
  let rawCandidates: RawCandidate[] = [];
  if (citations.length) {
    const corpus = searchLog.join("\n\n---\n\n");
    const report = await geminiStructured<{ candidates?: RawCandidate[] }>({
      system: RESEARCH_SYSTEM,
      user: `Cohort to find: ${query}

The user's goals (reference these ids in goal_links; do not invent ids):
${goalsDigest}

Here are the web search results you retrieved. Use ONLY these — do not introduce any other source:

${corpus}

Report every qualifying person. Each source_quote MUST be an exact verbatim substring of one source's CONTENT above (never a paraphrase). Set channel/field source_url values only to URLs that appear above. Omit any field you cannot back. Do not include any dates.`,
      schema: REPORT_TOOL.input_schema,
      maxTokens: REPORT_MAX_TOKENS,
    });
    rawCandidates = report?.candidates ?? [];
  }

  const goalIds = new Set(goals.map((g) => g.id));
  const candidates = rawCandidates
    .map((r) => validate(r, citations, urls, goalIds))
    .filter((c): c is ValidatedCandidate => c !== null);

  return {
    candidates,
    summary: buildSummary(query, candidates, citations.length),
    citationCount: citations.length,
  };
}
