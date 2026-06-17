import "server-only";

/**
 * The citation-allowlist validation gate — shared across research agents.
 *
 * Hard rule #3 in code form: the model's reported URLs and quotes are UNTRUSTED. We harvest the real
 * citations the server-side web_search tool produced (url + cited_text), then any claim a candidate
 * makes is only kept if a real citation backs it. This is what makes provenance verifiable instead of
 * cosmetic.
 *
 * NOTE: src/lib/research/extract.ts (the people agent, shipped + verified earlier) carries an
 * equivalent private copy of these helpers. This module is the canonical version for new agents; the
 * people agent can be migrated onto it later without behavior change.
 */

export type Citation = { url: string; citedText: string };

export function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Is `quote` genuinely backed by the real citation `citedText`? Directional on purpose: the quote
 * must be (essentially) a substring OF the citation. We tolerate the ~150-char cited_text truncation
 * by also accepting the reverse direction — but ONLY when the real citation fragment is itself
 * substantial (>= 40 chars), so a short real fragment can never "back" a long model-authored paraphrase.
 */
export function backs(citedText: string, quote: string): boolean {
  if (!quote || !citedText) return false;
  const h = norm(citedText);
  const n = norm(quote);
  if (n.length < 12) return false; // too short to be a meaningful, attributable quote
  if (h.includes(n)) return true;
  return n.includes(h) && h.length >= 40;
}

export function clamp01(n: unknown): number | undefined {
  if (typeof n !== "number" || Number.isNaN(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

/** Scan assistant content blocks for the web_search tool's real citations + result URLs. */
export function harvestCitations(blocks: unknown[]): { citations: Citation[]; urls: Set<string> } {
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
