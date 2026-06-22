import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchLinkedInPeople } from "./search";
import { getCredentialForSite } from "@/lib/credentials/store";
import type { LinkedInScrapeInput, LinkedInScrapeResult } from "./types";

/**
 * LinkedIn contact-sourcing, the orchestrator.
 *
 * Resolves WHO to search for (from a linked application run, an opportunity, or a raw org+role), drives
 * the search (./search.ts), and lands the results in the Review queue as suggested contacts. We reuse
 * the existing `research_runs → contacts → Review → People` pipeline (exactly like the Google Sheets
 * importer), so discovered people show up in Review and, once accepted, get the existing Outreach
 * "draft an email" button for free. Provenance per hard rule #3: every jarvis-created contact carries
 * source_id + a non-empty source_quote (here, the LinkedIn profile URL + the on-page headline).
 */

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;

type Target = { org: string; role: string; roleHint: string };

function roleHintFor(kindOrCategory: string | null | undefined): string {
  const k = (kindOrCategory ?? "").toLowerCase();
  if (["grant", "fellowship", "scholarship", "program", "accelerator"].includes(k)) return "program officer";
  if (["job", "internship"].includes(k)) return "recruiter";
  return "";
}

/** Figure out the organization + a useful role hint to search for. */
async function resolveTarget(
  supabase: SupabaseClient,
  userId: string,
  input: LinkedInScrapeInput,
): Promise<Target> {
  let org = (input.org ?? "").trim();
  let role = (input.role ?? "").trim();
  let hintSeed: string | null = null;

  if (input.applicationId) {
    const { data: run } = await supabase
      .from("application_runs")
      .select("organization, title, kind, opportunity_id")
      .eq("id", input.applicationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (run) {
      org ||= (run.organization as string | null)?.trim() ?? "";
      role ||= (run.title as string | null)?.trim() ?? "";
      hintSeed = (run.kind as string | null) ?? null;
      const oppId = run.opportunity_id as string | null;
      if (oppId && (!org || !hintSeed)) {
        const { data: opp } = await supabase
          .from("opportunities")
          .select("organization, title, category")
          .eq("id", oppId)
          .eq("user_id", userId)
          .maybeSingle();
        if (opp) {
          org ||= (opp.organization as string | null)?.trim() ?? "";
          role ||= (opp.title as string | null)?.trim() ?? "";
          hintSeed ||= (opp.category as string | null) ?? null;
        }
      }
    }
  } else if (input.opportunityId) {
    const { data: opp } = await supabase
      .from("opportunities")
      .select("organization, title, category")
      .eq("id", input.opportunityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (opp) {
      org ||= (opp.organization as string | null)?.trim() ?? "";
      role ||= (opp.title as string | null)?.trim() ?? "";
      hintSeed = (opp.category as string | null) ?? null;
    }
  }

  return { org, role, roleHint: roleHintFor(hintSeed) };
}

function buildQuery(input: LinkedInScrapeInput, t: Target): string {
  const override = (input.query ?? "").trim();
  if (override) return override.slice(0, 200);
  // Org name scopes the search to the right people; the role hint surfaces the most outreach-relevant
  // ones (recruiters / program officers) rather than fellow applicants.
  return [t.org, t.roleHint].filter(Boolean).join(" ").trim();
}

/** Extract a stable identity (the /in/<slug>) so we can dedup against contacts already saved. */
function linkedinSlug(url: string): string {
  const m = (url || "").match(/\/in\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : (url || "").toLowerCase();
}

export async function runLinkedInScrape(
  supabase: SupabaseClient,
  userId: string,
  input: LinkedInScrapeInput,
): Promise<LinkedInScrapeResult> {
  const target = await resolveTarget(supabase, userId, input);
  const query = buildQuery(input, target);
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT));

  const empty = (over: Partial<LinkedInScrapeResult>): LinkedInScrapeResult => ({
    ok: false,
    needsLogin: false,
    found: 0,
    inserted: 0,
    skipped: 0,
    query,
    researchRunId: null,
    message: "",
    ...over,
  });

  if (!query) {
    return empty({
      message: "I couldn't tell which organization to search. Open this from an application or opportunity, or give me a company name.",
    });
  }

  const login = await getCredentialForSite(supabase, userId, "linkedin.com");
  const search = await searchLinkedInPeople(query, limit, { userId, login });
  if (!search.ok) {
    return empty({ needsLogin: search.reason === "needs_login", message: search.message });
  }
  if (search.people.length === 0) {
    return empty({ ok: true, message: `No people surfaced for "${query}". Try a broader company name or a custom query.` });
  }

  // Dedup against LinkedIn profiles already saved for this user.
  const { data: existing } = await supabase
    .from("contacts")
    .select("id, contact_channels(kind, value)")
    .eq("user_id", userId);
  const have = new Set<string>();
  for (const c of (existing ?? []) as { contact_channels?: { kind: string; value: string }[] }[]) {
    for (const ch of c.contact_channels ?? []) {
      if (ch.kind === "linkedin" && ch.value) have.add(linkedinSlug(ch.value));
    }
  }

  const nowISO = new Date().toISOString();
  const permalink = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;

  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .insert({ user_id: userId, query: `LinkedIn: ${query}`, target_kind: "people", status: "running" })
    .select("id")
    .single();
  if (runErr || !run) {
    return empty({ ok: true, found: search.people.length, message: "Couldn't open a review run to save the people I found." });
  }
  const runId = run.id as string;

  const { data: source } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      source_type: "linkedin",
      title: `LinkedIn people search: ${query}`,
      permalink,
      occurred_at: nowISO,
      raw_text: `People surfaced from a LinkedIn people search for "${query}".`,
    })
    .select("id")
    .single();
  const sourceId = (source?.id as string | undefined) ?? null;
  // Provenance is mandatory (hard rule #3): every jarvis contact needs source_id + source_quote, and the
  // DB enforces it. Without a source row the contact inserts would all fail and be silently skipped, so
  // bail honestly rather than report "all already saved".
  if (!sourceId) {
    await supabase.from("research_runs").update({ status: "error" }).eq("id", runId);
    return empty({
      ok: true,
      found: search.people.length,
      researchRunId: runId,
      message: "I found people but couldn't record their source row (provenance is required), so nothing was saved. Try again.",
    });
  }
  await supabase.from("research_runs").update({ source_id: sourceId }).eq("id", runId);

  let inserted = 0;
  let skipped = 0;
  for (const person of search.people) {
    const slug = linkedinSlug(person.profileUrl);
    if (have.has(slug)) {
      skipped++;
      continue;
    }
    have.add(slug); // guard against repeats within this same result set

    // Honest provenance: exactly what the results page showed for this person.
    const quote =
      [person.headline, person.location].filter(Boolean).join(" · ").slice(0, 500) ||
      `LinkedIn profile: ${person.profileUrl}`;

    const { data: contact, error: cErr } = await supabase
      .from("contacts")
      .insert({
        user_id: userId,
        full_name: person.name,
        company: target.org || null,
        role_title: person.headline || target.role || null,
        relevance: `Surfaced from a LinkedIn people search for "${query}"${target.org ? ` (${target.org})` : ""}.`,
        source_id: sourceId,
        source_quote: quote,
        confidence: 0.5,
        review_status: "review",
        created_by: "jarvis",
        research_run_id: runId,
      })
      .select("id")
      .single();
    if (cErr || !contact) continue;

    await supabase
      .from("contact_channels")
      .insert({ contact_id: contact.id as string, kind: "linkedin", value: person.profileUrl, is_primary: true });
    inserted++;
  }

  await supabase.from("research_runs").update({ status: "done", result_count: inserted }).eq("id", runId);

  const skipNote = skipped > 0 ? ` (${skipped} already saved)` : "";
  const message =
    inserted > 0
      ? `Found ${search.people.length} on LinkedIn for "${query}", added ${inserted} to your Review queue${skipNote}. Accept the ones worth reaching out to, then draft an email from People.`
      : `Found ${search.people.length} on LinkedIn for "${query}", but all were already in your contacts${skipNote}.`;

  return { ok: true, needsLogin: false, found: search.people.length, inserted, skipped, query, researchRunId: runId, message };
}
