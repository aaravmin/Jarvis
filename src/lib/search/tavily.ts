import "server-only";

/**
 * Optional Tavily web-search client. Tavily is a search API tuned for LLM agents; we use it as a
 * RECALL BOOST: a quick preliminary search whose result URLs are seeded into the Opportunity agent's
 * context so Claude has fresh, relevant pages to investigate.
 *
 * Provenance is unaffected: seeds are hints only. Nothing Tavily returns is ever stored as a fact —
 * the agent must still cite a real web_search result for any claim to survive the citation gate
 * (src/lib/agents/citation-gate.ts). That keeps hard rule #3 intact.
 *
 * Entirely gated on TAVILY_API_KEY. With no key set, every function here is a safe no-op (returns []).
 * It also never throws: a Tavily outage degrades recall, it never aborts a run.
 */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const TIMEOUT_MS = 8000;

export type TavilyResult = { title: string; url: string; content: string; score?: number };

/** True when a TAVILY_API_KEY is configured. Callers can branch UI/telemetry on this. */
export function tavilyEnabled(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

/** Raw Tavily search. Returns [] on any error or when no key is set. */
export async function tavilySearch(
  query: string,
  opts: { maxResults?: number; searchDepth?: "basic" | "advanced" } = {},
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !query.trim()) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: query.slice(0, 400),
        search_depth: opts.searchDepth ?? "basic",
        max_results: Math.min(Math.max(opts.maxResults ?? 8, 1), 20),
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: TavilyResult[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return []; // outage / timeout / bad JSON — degrade to no seeds, never throw
  } finally {
    clearTimeout(timer);
  }
}

/** Bias the seed search toward the buckets the user asked for. */
function kindKeywords(kindFilter: string): string {
  switch (kindFilter) {
    case "programs":
      return "program OR fellowship OR accelerator OR scholarship";
    case "jobs":
      return "job OR internship OR hiring";
    case "hackathons":
      return "hackathon OR competition";
    default:
      return "program OR job OR hackathon OR fellowship";
  }
}

/**
 * Preliminary search → short "Title — url" hints for the agent prompt. Empty array when Tavily is
 * not configured (the agent then relies purely on its own web_search, exactly as before).
 */
export async function tavilySeedHints(query: string, kindFilter = "all"): Promise<string[]> {
  if (!tavilyEnabled()) return [];
  const results = await tavilySearch(`${query} (${kindKeywords(kindFilter)})`, {
    maxResults: 8,
    searchDepth: "advanced",
  });
  return results.map((r) => `${r.title} — ${r.url}`);
}
