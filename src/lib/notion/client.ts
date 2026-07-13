import "server-only";

/**
 * Minimal Notion REST client (read-only). Fetch-based, no SDK dependency. Every call takes the
 * caller's token: normally the user's own OAuth token (lib/notion/store.ts), or the deployment-wide
 * NOTION_API_KEY internal-integration token on a self-host. We never write anything back (hard rule
 * #1: Supabase is the system of record, Notion is at most a source we read from).
 */

const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "content-type": "application/json",
  };
}

/** GET/POST a Notion endpoint. Retries once on 429 (rate limited) after Retry-After; else throws readably. */
async function request<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  let res = await fetch(url, { ...init, headers: headers(token) });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after")) || 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    res = await fetch(url, { ...init, headers: headers(token) });
  }
  if (!res.ok) throw new Error(`Notion request failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

type NotionRichText = { plain_text?: string };

type NotionTitleProperty = { type?: string; title?: NotionRichText[] };

type NotionSearchResult = {
  id: string;
  url: string;
  last_edited_time: string;
  properties?: Record<string, NotionTitleProperty>;
};

type NotionSearchResponse = {
  results?: NotionSearchResult[];
  next_cursor?: string | null;
  has_more?: boolean;
};

function extractTitle(properties: Record<string, NotionTitleProperty> | undefined): string {
  for (const key of Object.keys(properties ?? {})) {
    const prop = properties![key];
    if (prop?.type === "title") {
      const text = (prop.title ?? [])
        .map((r) => r.plain_text ?? "")
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return "(untitled)";
}

export type NotionPageSummary = {
  id: string;
  url: string;
  title: string;
  last_edited_time: string;
};

const MAX_RESULTS = 50;
const SEARCH_PAGE_SIZE = 25;
const MAX_SEARCH_PAGES = 10; // guard against runaway pagination

/**
 * Pages recently edited, most-recent first, that the token's grant can see. Stops paginating as soon
 * as it sees a page edited before `sinceISO` (results are sorted descending), or once it has
 * collected ~50 pages.
 */
export async function searchRecentPages(token: string, sinceISO: string): Promise<NotionPageSummary[]> {
  const out: NotionPageSummary[] = [];
  const since = new Date(sinceISO).getTime();
  let cursor: string | undefined;
  let calls = 0;

  while (out.length < MAX_RESULTS && calls < MAX_SEARCH_PAGES) {
    calls++;
    const body: Record<string, unknown> = {
      filter: { value: "page", property: "object" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: SEARCH_PAGE_SIZE,
    };
    if (cursor) body.start_cursor = cursor;

    const data = await request<NotionSearchResponse>(token, `${API}/search`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    let hitOld = false;
    for (const page of data.results ?? []) {
      const editedAt = new Date(page.last_edited_time).getTime();
      if (!Number.isNaN(since) && editedAt < since) {
        hitOld = true;
        break;
      }
      out.push({
        id: page.id,
        url: page.url,
        title: extractTitle(page.properties),
        last_edited_time: page.last_edited_time,
      });
      if (out.length >= MAX_RESULTS) break;
    }

    if (hitOld || !data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return out;
}

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};

type NotionBlockChildrenResponse = {
  results?: NotionBlock[];
  next_cursor?: string | null;
  has_more?: boolean;
};

const CHILDREN_PAGE_SIZE = 100;
const MAX_CHILDREN_PAGES = 20; // guard against runaway pagination on a huge page

function blockPlainText(block: NotionBlock): string {
  const body = block[block.type] as { rich_text?: NotionRichText[] } | undefined;
  return (body?.rich_text ?? []).map((r) => r.plain_text ?? "").join("");
}

async function fetchChildren(token: string, blockId: string): Promise<NotionBlock[]> {
  const out: NotionBlock[] = [];
  let cursor: string | undefined;
  let calls = 0;
  do {
    const url = new URL(`${API}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", String(CHILDREN_PAGE_SIZE));
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const data = await request<NotionBlockChildrenResponse>(token, url.toString());
    out.push(...(data.results ?? []));
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
    calls++;
  } while (cursor && calls < MAX_CHILDREN_PAGES);
  return out;
}

const MAX_TEXT = 20_000;

/**
 * Readable plain text for a page: walks its top-level blocks and recurses ONE level into container
 * blocks (toggles, bulleted/numbered lists, etc.) that have children, so nested notes are captured
 * without an unbounded recursive crawl. Capped at ~20k chars.
 */
export async function pageText(token: string, pageId: string): Promise<string> {
  const top = await fetchChildren(token, pageId);
  const lines: string[] = [];

  for (const block of top) {
    const text = blockPlainText(block).trim();
    if (text) lines.push(text);

    if (block.has_children) {
      try {
        const kids = await fetchChildren(token, block.id);
        for (const kid of kids) {
          const kidText = blockPlainText(kid).trim();
          if (kidText) lines.push(`  ${kidText}`);
        }
      } catch {
        // best-effort: a broken child fetch shouldn't drop the parent block's text
      }
    }

    if (lines.join("\n").length > MAX_TEXT) break;
  }

  return lines.join("\n").slice(0, MAX_TEXT);
}
