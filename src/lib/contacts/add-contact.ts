import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importContactFromLinkedIn } from "@/lib/contacts/import-linkedin";
import { normalizeLinkedInProfileUrl, searchLinkedInPeople } from "@/lib/agents/linkedin/search";
import { getCredentialForSite } from "@/lib/credentials/store";
import { browserEnabled } from "@/lib/agents/application/browser";
import { apolloEnabled, apolloMatchPerson, type ApolloPerson } from "@/lib/apollo";
import type { LinkedInPerson } from "@/lib/agents/linkedin/types";

/**
 * Add ONE contact the conversational assistant was asked to "look up" or "make a card for", the brain's
 * hands for the LinkedIn/Apollo scraping that the People tab already exposes via a button. Two ways in:
 *   • a LinkedIn URL the user pasted → straight to importContactFromLinkedIn (scrape page + Apollo email);
 *   • just a NAME (+ optional company) → resolve their profile first, then import:
 *, browser People-search (the user's own logged-in window) finds the /in/ URL → import it;
 *, else Apollo match-by-name returns a LinkedIn URL → import that;
 *, else Apollo gave real data but no URL → save a contact from Apollo alone (email/role/company).
 *
 * Every created contact is an explicit, single-person USER action → `created_by='user'`,
 * `review_status='accepted'` (it lands in People, like the manual form / the People-tab importer, NOT
 * autonomous discovery, so not Review). Provenance rides in `field_sources` + `source_quote` so the
 * card's source chip works (hard rule #4). Degrades honestly: with no browser and no Apollo it tells the
 * user to paste a URL or set the env vars, instead of inventing anyone.
 */

export type AddContactInput = {
  name?: string;
  linkedinUrl?: string;
  company?: string;
  /** A short note on who they are / why (e.g. "CS101 professor"), saved to the contact's notes. */
  context?: string;
};

export type AddContactResult = {
  ok: boolean;
  contactId: string | null;
  fullName: string | null;
  /** The LinkedIn profile we landed on, if any (used as the action receipt's link). */
  profileUrl: string | null;
  role: string | null;
  email: string | null;
  /** True when LinkedIn showed a login wall and we had no other way in, sign in and retry. */
  needsLogin: boolean;
  alreadyExisted: boolean;
  /** Names found that did NOT confidently match the request, so the assistant can ask which one. */
  candidates?: string[];
  message: string;
};

type FieldSource = { url?: string; quote?: string; confidence?: number; status?: string };

function failResult(message: string, over: Partial<AddContactResult> = {}): AddContactResult {
  return {
    ok: false,
    contactId: null,
    fullName: null,
    profileUrl: null,
    role: null,
    email: null,
    needsLogin: false,
    alreadyExisted: false,
    message,
    ...over,
  };
}

/** Normalize a person's name for matching (lowercase, strip punctuation, collapse spaces). */
function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_STOP = new Set(["dr", "mr", "ms", "mrs", "prof", "the"]);
/** Significant name tokens (drop 1-char initials and titles). */
function nameTokens(s: string): string[] {
  return normName(s).split(" ").filter((t) => t.length >= 2 && !NAME_STOP.has(t));
}

/** Levenshtein distance, capped, so we tolerate a small typo without matching a different name. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[a.length];
}

/**
 * Two name tokens count as the same only if equal or within a small typo distance (1 edit for short
 * tokens, 2 for longer). Deliberately strict: "Soham"/"Sohum" match (a typo), but "Smith"/"Smithson"
 * and "Mike"/"Michael" do not. A near-miss becomes a clarifying question, never a silent wrong match.
 */
function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const thresh = Math.max(a.length, b.length) >= 6 ? 2 : 1;
  return editDistance(a, b) <= thresh;
}

/**
 * Does a candidate's name actually match the requested one? EVERY token of the requested name must have
 * a similar token in the candidate. So "Soham Sanu" matches "Soham K. Sanu" and tolerates the typo
 * "Sohum Sanu", but NOT "Soham Rege" (a different surname). This is what stops Jarvis from confidently
 * returning the wrong person who merely shares a first name.
 */
function nameMatches(candidate: string, requested: string): boolean {
  const req = nameTokens(requested);
  const cand = nameTokens(candidate);
  if (!req.length || !cand.length) return false;
  return req.every((rt) => cand.some((ct) => tokenSimilar(rt, ct)));
}

/**
 * Pick the ONE result that confidently matches the requested name, or null. It NEVER falls back to
 * LinkedIn's top result: returning a same-first-name stranger is worse than saying "I could not find
 * them" and asking. When zero or several results match, return null so the caller surfaces candidates.
 */
function pickBest(people: LinkedInPerson[], name: string): LinkedInPerson | null {
  if (!people.length || !nameTokens(name).length) return null;
  const exact = people.filter((p) => normName(p.name) === normName(name));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null; // duplicate exact names, ambiguous, ask
  const matches = people.filter((p) => nameMatches(p.name, name));
  return matches.length === 1 ? matches[0] : null;
}

export async function addContact(
  supabase: SupabaseClient,
  userId: string,
  input: AddContactInput,
): Promise<AddContactResult> {
  const name = (input.name ?? "").trim();
  const company = (input.company ?? "").trim();

  // 1, Resolve a LinkedIn URL: the user's, else search for it by name.
  let url = input.linkedinUrl ? normalizeLinkedInProfileUrl(input.linkedinUrl) : null;
  // Names we found that did NOT confidently match, kept so we can ask rather than guess.
  let candidates: string[] = [];

  if (!url && name) {
    const query = [name, company].filter(Boolean).join(" ");

    // 1a, Browser People-search (the most reliable source of the real /in/ URL).
    if (browserEnabled()) {
      const login = await getCredentialForSite(supabase, userId, "linkedin.com");
      const res = await searchLinkedInPeople(query, 6, { userId, login });
      if (!res.ok && res.reason === "needs_login") {
        return failResult(res.message || "Log into LinkedIn in the window I just opened, then ask me to add them again.", { needsLogin: true });
      }
      if (res.ok) {
        const best = pickBest(res.people, name);
        if (best) url = normalizeLinkedInProfileUrl(best.profileUrl) ?? best.profileUrl;
        else if (res.people.length) candidates = res.people.slice(0, 5).map((p) => p.name);
      }
    }

    // 1b, Apollo match by name → use it only if the name it returns ACTUALLY matches the request.
    if (!url && apolloEnabled()) {
      const ap = await apolloMatchPerson({ name, company: company || undefined });
      if (ap?.name && nameMatches(ap.name, name)) {
        if (ap.linkedinUrl) url = normalizeLinkedInProfileUrl(ap.linkedinUrl) ?? ap.linkedinUrl;
        else return await insertFromApollo(supabase, userId, ap, input.context);
      } else if (ap?.name) {
        // Apollo returned a different person; offer them as a candidate, never add them silently.
        candidates = [...new Set([...candidates, ap.name])];
      }
    }
  }

  // 2, Have a URL → the full scrape + Apollo importer (handles dedup, provenance, the source chip).
  if (url) {
    const r = await importContactFromLinkedIn(supabase, userId, url);
    if (r.ok && r.contactId && !r.alreadyExisted && input.context?.trim()) {
      // Fold the user's "who is this" note into the NEW contact (the importer doesn't take one).
      // Skip when the contact already existed, we'd otherwise overwrite the notes they already have.
      await supabase.from("contacts").update({ notes: input.context.trim().slice(0, 500) }).eq("id", r.contactId);
    }
    return {
      ok: r.ok,
      contactId: r.contactId,
      fullName: r.fullName,
      profileUrl: url,
      role: r.roleTitle,
      email: r.email,
      needsLogin: r.needsLogin,
      alreadyExisted: r.alreadyExisted,
      message: r.message,
    };
  }

  // 3, Couldn't resolve anyone. Say why, honestly.
  if (!name && !input.linkedinUrl) {
    return failResult("Tell me who to add, a name (their company helps) or their LinkedIn profile URL.");
  }
  // We found people, but none confidently matched the requested name. Surface them and ASK rather than
  // adding the wrong person (e.g. a same-first-name stranger). This is where the clarifying question lives.
  if (candidates.length) {
    const orgHint = company
      ? ` Note: "${company}" might be where they studied or where they work, and the people above may only have worked there, tell me which you meant.`
      : "";
    return failResult(
      `I could not confidently find ${name}${company ? ` from ${company}` : ""}. The closest people I found were: ${candidates.join(", ")}. None clearly matched that exact name, so I did not add anyone. Which one did you mean, or paste their LinkedIn URL?${orgHint}`,
      { candidates },
    );
  }
  const why =
    !browserEnabled() && !apolloEnabled()
      ? "I have no way to look people up automatically right now, paste their LinkedIn URL, or set JARVIS_BROWSER=playwright / APOLLO_API_KEY."
      : "Paste their LinkedIn URL and I'll build the full card.";
  return failResult(`I couldn't find ${name || "that person"} online. ${why}`);
}

/**
 * Save a contact from an Apollo match that carried no LinkedIn URL. Same provenance shape as the
 * LinkedIn importer (apollo.io as the per-field source), so the card renders a working source chip.
 */
async function insertFromApollo(
  supabase: SupabaseClient,
  userId: string,
  ap: ApolloPerson,
  context?: string,
): Promise<AddContactResult> {
  const fullName = ap.name.trim();
  const role = ap.title?.trim() || null;
  const company = ap.organization?.trim() || null;
  const email = ap.email?.trim() || null;
  const linkedin = ap.linkedinUrl?.trim() || null;
  const verified = ap.emailStatus === "verified";

  const fieldSources: Record<string, FieldSource> = {};
  if (role) fieldSources.role_title = { url: "https://apollo.io", quote: "Title via Apollo.io.", confidence: 0.6 };
  if (company) fieldSources.company = { url: "https://apollo.io", quote: "Organization via Apollo.io.", confidence: 0.6 };
  if (email) {
    fieldSources.email = {
      url: "https://apollo.io",
      quote: `Work email via Apollo.io (${ap.emailStatus ?? "unverified"}).`,
      confidence: verified ? 0.9 : 0.6,
      status: verified ? "verified" : "unconfirmed",
    };
  }

  const sourceQuote = ([role, company].filter(Boolean).join(" at ") || `Matched via Apollo.io: ${fullName}`).slice(0, 500);
  // Keep at least one url-bearing field_sources entry so the card's source chip links back to a source
  // (rowsToPerson picks the first field_sources url as the permalink). With only a bare name from Apollo,
  // the per-field entries above can all be empty, seed the Apollo source itself.
  if (!Object.values(fieldSources).some((v) => v?.url)) {
    fieldSources.profile = { url: "https://apollo.io", quote: sourceQuote, confidence: 0.5 };
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      user_id: userId,
      full_name: fullName,
      company,
      role_title: role,
      relevance: "Found via Apollo.io.",
      notes: context?.trim()?.slice(0, 500) || "Found via Apollo.io (no LinkedIn URL).",
      source_quote: sourceQuote,
      confidence: email && verified ? 0.8 : 0.6,
      field_sources: fieldSources,
      created_by: "user",
      review_status: "accepted",
    })
    .select("id")
    .single();
  if (error || !contact) return failResult(error?.message ?? "Couldn't save the contact.");
  const contactId = contact.id as string;

  const channels: { contact_id: string; kind: string; value: string; is_primary: boolean }[] = [];
  if (email) channels.push({ contact_id: contactId, kind: "email", value: email, is_primary: true });
  if (linkedin) channels.push({ contact_id: contactId, kind: "linkedin", value: linkedin, is_primary: !email });
  let channelNote = "";
  if (channels.length) {
    const { error: chErr } = await supabase.from("contact_channels").insert(channels);
    if (chErr) {
      console.warn(`[add-contact] channel insert failed for ${contactId}: ${chErr.message}`);
      channelNote = " (couldn't save their email, open the contact to add it)";
    }
  }

  const detail = [role, company].filter(Boolean).join(" at ");
  return {
    ok: true,
    contactId,
    fullName,
    profileUrl: linkedin,
    role,
    email,
    needsLogin: false,
    alreadyExisted: false,
    message: `Added ${fullName}${detail ? `, ${detail}` : ""} to your contacts${email ? " with their work email" : ""}.${channelNote}`,
  };
}
