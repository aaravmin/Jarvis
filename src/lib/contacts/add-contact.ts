import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importContactFromLinkedIn } from "@/lib/contacts/import-linkedin";
import { normalizeLinkedInProfileUrl, searchLinkedInPeople } from "@/lib/agents/linkedin/search";
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

/** Normalize a person's name for loose matching (case/punctuation-insensitive). */
function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pick the search result that best matches the requested name. Prefer an exact normalized match, then a
 * containment match, then LinkedIn's own top-ranked result (the query carried the company, so its #1 is
 * usually right). The contact is reviewable on its card, so a rare wrong pick is correctable.
 */
function pickBest(people: LinkedInPerson[], name: string): LinkedInPerson | null {
  if (!people.length) return null;
  const target = normName(name);
  if (!target) return people[0];
  return (
    people.find((p) => normName(p.name) === target) ??
    people.find((p) => normName(p.name).includes(target) || target.includes(normName(p.name))) ??
    people[0]
  );
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

  if (!url && name) {
    const query = [name, company].filter(Boolean).join(" ");

    // 1a, Browser People-search (the most reliable source of the real /in/ URL).
    if (browserEnabled()) {
      const res = await searchLinkedInPeople(query, 6);
      if (!res.ok && res.reason === "needs_login") {
        return failResult("Log into LinkedIn in the window I just opened, then ask me to add them again.", { needsLogin: true });
      }
      if (res.ok) {
        const best = pickBest(res.people, name);
        if (best) url = normalizeLinkedInProfileUrl(best.profileUrl) ?? best.profileUrl;
      }
    }

    // 1b, Apollo match by name → it carries a linkedin_url we can import (and reveals the work email).
    if (!url && apolloEnabled()) {
      const ap = await apolloMatchPerson({ name, company: company || undefined });
      if (ap?.linkedinUrl) {
        url = normalizeLinkedInProfileUrl(ap.linkedinUrl) ?? ap.linkedinUrl;
      } else if (ap?.name) {
        // Real Apollo data but no LinkedIn URL, save the contact from Apollo alone.
        return await insertFromApollo(supabase, userId, ap, input.context);
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
