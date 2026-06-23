import "server-only";
import { webSearch, tavilyEnabled } from "@/lib/search/tavily";

/**
 * A short web-research snippet about a person, used to GROUND the inferred parts of an outreach email
 * (what they do, what they have worked on) so a template's bracketed slots can be filled with real,
 * specific facts instead of left blank. Best-effort: returns "" when web search is off or finds nothing.
 */
export async function webContextForContact(name: string, company?: string, roleTitle?: string): Promise<string> {
  if (!tavilyEnabled() || !name.trim()) return "";
  try {
    const q = [name.trim(), company?.trim() || roleTitle?.trim()].filter(Boolean).join(" ");
    const hits = await webSearch(q, { maxResults: 4 });
    return hits
      .map((h) => `${h.title}: ${h.content}`)
      .join("\n")
      .slice(0, 2500);
  } catch {
    return "";
  }
}
