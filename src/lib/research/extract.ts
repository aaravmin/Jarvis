import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * The cohort research engine. Given a natural-language query + the user's goals, it asks Claude to
 * find real people via web search, then VALIDATES every claim against the web_search tool's own
 * citation objects before anything is returned for persistence.
 *
 * The load-bearing rule (hard rule #3): the model's reported URLs and quotes are UNTRUSTED. We
 * harvest the real citations the server-side web_search tool produced (url + cited_text), build a
 * per-run allowlist, and:
 *   - DROP any candidate whose source_quote is not backed by a real citation, and
 *   - null any field/channel source URL not in the allowlist.
 * That makes provenance verifiable rather than cosmetic. Nothing here computes dates.
 */

// Stable web search tool (no code-execution dependency). 'web_search_20260209' also exists and adds
// dynamic filtering, but requires the code execution tool; the stable version is enough here.
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 8,
} as const;

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_PAUSE_CONTINUATIONS = 6;
const MAX_TOKENS = 8000;
// Phase 2 (the structured report) needs more room: a cohort of people, each with verbatim quotes
// and channels, can be large, and a truncated tool input would silently drop candidates.
const REPORT_MAX_TOKENS = 16000;

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

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. The research engine runs server-side and needs it in .env.local.",
    );
  }
  return new Anthropic({ apiKey });
}

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

/** Scan assistant content blocks for the web_search tool's real citations + result URLs. */
function harvestCitations(blocks: unknown[]): { citations: Citation[]; urls: Set<string> } {
  const citations: Citation[] = [];
  const urls = new Set<string>();
  for (const raw of blocks) {
    const block = raw as {
      type?: string;
      content?: Array<{ type?: string; url?: string }>;
      citations?: Array<{ type?: string; url?: string; cited_text?: string }>;
    };
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === "web_search_result" && r.url) urls.add(r.url);
      }
    }
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.type === "web_search_result_location" && c.url) {
          urls.add(c.url);
          citations.push({ url: c.url, citedText: c.cited_text ?? "" });
        }
      }
    }
  }
  return { citations, urls };
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

/** Run the two-phase research: (1) search the web, (2) force a structured, validated report. */
export async function runPeopleResearch(
  query: string,
  goals: GoalDigest[],
): Promise<ResearchOutcome> {
  const client = getClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const goalsDigest = goals.length
    ? goals.map((g) => `- (${g.id}) ${g.title}`).join("\n")
    : "(no goals on file)";

  // Phase 1 — research with web search. Loop through any pause_turn server-tool continuations.
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Cohort to find: ${query}

The user's goals (reference these ids in goal_links; do not invent ids):
${goalsDigest}

Search the web and identify real, named people who match this cohort. For each person, quote the exact short sentence from a source that proves they match.`,
    },
  ];

  const collected: unknown[] = [];
  // The SDK's tool union types drift across versions; this glue passes well-formed objects.
  const searchParams = {
    model,
    max_tokens: MAX_TOKENS,
    system: RESEARCH_SYSTEM,
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
        "Now call report_candidates with every qualifying person. Each source_quote must be copied verbatim from a search result you cited above. Omit any field you cannot back with a citation. Do not include any dates.",
    },
  ];

  const reportParams = {
    model,
    max_tokens: REPORT_MAX_TOKENS,
    // web_search stays declared so the replayed phase-1 history (which contains web_search blocks)
    // validates; tool_choice forces the report, so no new search runs.
    tools: [WEB_SEARCH_TOOL, REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_candidates" },
    messages: phase2Messages,
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const structured = await client.messages.create(reportParams);
  const toolBlock = structured.content.find(
    (b) => b.type === "tool_use" && b.name === "report_candidates",
  ) as Anthropic.ToolUseBlock | undefined;

  // A missing report block is NOT an empty result — distinguish refusal / truncation / pause so the
  // run is finalized as an error rather than a misleading "0 verified matches".
  if (!toolBlock) {
    if (structured.stop_reason === "max_tokens") {
      throw new Error("Research report was truncated (max_tokens) before it completed.");
    }
    if (structured.stop_reason === "refusal") {
      throw new Error("The model declined to produce a research report for this query.");
    }
    throw new Error(
      `Research produced no structured report (stop_reason=${structured.stop_reason ?? "unknown"}).`,
    );
  }

  const rawCandidates: RawCandidate[] =
    (toolBlock.input as { candidates?: RawCandidate[] } | undefined)?.candidates ?? [];

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
