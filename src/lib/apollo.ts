import "server-only";

/**
 * Optional Apollo.io people client — finds work emails. Two capabilities:
 *   • MATCH (apolloMatchPerson): given an Apollo id (or a name + company / domain / LinkedIn) return
 *     that person's work email — used to enrich a contact that's missing one;
 *   • SEARCH (apolloSearchPeople): given keywords / title / company, return candidate people to
 *     import as new contacts. NOTE: Apollo's search endpoint never returns emails — it's discovery
 *     only. To get an email for a search result you must MATCH it (by id) afterward, which import does.
 *
 * Entirely gated on APOLLO_API_KEY. With no key set, apolloEnabled() is false and the functions
 * return null / [] — every caller degrades gracefully (the feature just doesn't appear). It never
 * throws on an Apollo outage: a failure degrades the feature, it doesn't crash the request.
 *
 * Provenance (hard rule #3): anything we persist from Apollo records Apollo as the source in the
 * contact's field_sources and is user-initiated (created_by 'user'), so the user is choosing to trust
 * it — we never auto-write Apollo data as a 'jarvis'-derived fact.
 */

const API = "https://api.apollo.io/api/v1";
const TIMEOUT_MS = 10_000;

/** True when an APOLLO_API_KEY is configured. Callers gate UI on this so buttons aren't dead. */
export function apolloEnabled(): boolean {
  return !!process.env.APOLLO_API_KEY;
}

export type ApolloPerson = {
  id?: string; // Apollo's person id — the precise key to enrich (match) this exact person later
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  organization?: string;
  email?: string; // a real, usable address — undefined when Apollo returns a locked placeholder
  emailStatus?: string; // apollo's email_status: "verified" | "guessed" | "unavailable" | ...
  linkedinUrl?: string;
  photoUrl?: string;
};

async function apolloFetch(path: string, body: Record<string, unknown>): Promise<unknown | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "cache-control": "no-cache", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Don't crash, but surface the status (403 = plan/endpoint issue, 422 = bad params) so a
      // misconfigured key isn't an invisible no-op. Never log the body — it can echo the request.
      console.warn(`[apollo] ${path} → ${res.status}`);
      return null;
    }
    return await res.json();
  } catch {
    return null; // outage / timeout / bad JSON — degrade, never throw
  } finally {
    clearTimeout(timer);
  }
}

// Apollo returns "email_not_unlocked@domain.com" placeholders for rows you haven't paid to reveal —
// never surface those as if they were a real address.
function realEmail(email?: string | null): string | undefined {
  const e = (email ?? "").trim();
  if (!e || !e.includes("@")) return undefined;
  if (/not_unlocked|email_hidden|email_masked/i.test(e)) return undefined;
  return e;
}

type RawPerson = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  linkedin_url?: string;
  photo_url?: string;
  organization?: { name?: string } | null;
};

function mapPerson(p: RawPerson): ApolloPerson {
  const name = (p.name || [p.first_name, p.last_name].filter(Boolean).join(" ")).trim();
  return {
    id: p.id || undefined,
    name,
    firstName: p.first_name || undefined,
    lastName: p.last_name || undefined,
    title: p.title || undefined,
    organization: p.organization?.name || undefined,
    email: realEmail(p.email),
    emailStatus: p.email_status || undefined,
    linkedinUrl: p.linkedin_url || undefined,
    photoUrl: p.photo_url || undefined,
  };
}

/** Enrich one person to reveal their work email — by Apollo id (most precise, for a search result) or
 *  by name (+ optional company / domain / LinkedIn). null when not found, not enough to match on, or
 *  no key. `reveal_personal_emails` is left off so we only surface work emails. */
export async function apolloMatchPerson(input: {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  domain?: string;
  linkedinUrl?: string;
}): Promise<ApolloPerson | null> {
  if (!apolloEnabled()) return null;
  const body: Record<string, unknown> = {};
  if (input.id) body.id = input.id;
  if (input.name) body.name = input.name;
  if (input.firstName) body.first_name = input.firstName;
  if (input.lastName) body.last_name = input.lastName;
  if (input.company) body.organization_name = input.company;
  if (input.domain) body.domain = input.domain;
  if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl;
  if (!body.id && !body.name && !body.first_name && !body.linkedin_url) return null; // not enough to match on
  const data = (await apolloFetch("/people/match", body)) as { person?: RawPerson } | null;
  if (!data?.person) return null;
  return mapPerson(data.person);
}

/**
 * Search Apollo for candidate people (discovery only — emails are NOT returned here; the caller must
 * MATCH each result by id to reveal an email). Returns [] when no key / on any error. Uses the
 * `/mixed_people/api_search` endpoint — the plain `/mixed_people/search` is the dashboard endpoint and
 * 403s on API/lower plans.
 */
export async function apolloSearchPeople(input: {
  query?: string;
  titles?: string[];
  company?: string;
  limit?: number;
}): Promise<ApolloPerson[]> {
  if (!apolloEnabled()) return [];
  const perPage = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const body: Record<string, unknown> = { page: 1, per_page: perPage };
  if (input.query) body.q_keywords = input.query.slice(0, 200);
  if (input.titles?.length) body.person_titles = input.titles.slice(0, 10);
  if (input.company) body.q_organization_name = input.company.slice(0, 120);
  const data = (await apolloFetch("/mixed_people/api_search", body)) as { people?: RawPerson[] } | null;
  if (!Array.isArray(data?.people)) return [];
  return data!.people.map(mapPerson).filter((p) => p.name.length > 0);
}
