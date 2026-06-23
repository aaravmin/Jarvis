import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scrapeLinkedInProfile, normalizeLinkedInProfileUrl } from "@/lib/agents/linkedin/search";
import { getCredentialForSite } from "@/lib/credentials/store";
import { apolloEnabled, apolloMatchPerson, type ApolloPerson } from "@/lib/apollo";
import type { LinkedInProfile } from "@/lib/agents/linkedin/types";
import { grokStructured } from "@/lib/llm/grok";
import { webSearch, tavilyEnabled } from "@/lib/search/tavily";
import { loadProfile, profileDigest } from "@/lib/profile";

/**
 * Build a grounded "who they are" + "why they matter to me" from real facts only (the scraped profile,
 * plus a quick web search, plus the user's own profile for relevance). Never invents; falls back to the
 * raw About text if the model is unavailable. No em-dashes in the output.
 */
async function enrichSummary(
  supabase: SupabaseClient,
  userId: string,
  facts: { name: string; headline?: string; roleTitle?: string; company?: string; location?: string; about?: string; education?: string },
): Promise<{ background: string; relevance: string }> {
  let webText = "";
  if (tavilyEnabled()) {
    try {
      const q = [facts.name, facts.company || facts.roleTitle].filter(Boolean).join(" ");
      const hits = await webSearch(q, { maxResults: 4 });
      webText = hits.map((h) => `${h.title}: ${h.content}`).join("\n").slice(0, 2500);
    } catch {
      /* web search is best-effort */
    }
  }
  const me = profileDigest(await loadProfile(supabase));
  const factLines = [
    `Name: ${facts.name}`,
    facts.headline && `Headline: ${facts.headline}`,
    facts.roleTitle && `Current role: ${facts.roleTitle}`,
    facts.company && `Company/org: ${facts.company}`,
    facts.location && `Location: ${facts.location}`,
    facts.education && `Education: ${facts.education}`,
    facts.about && `Their LinkedIn About: ${facts.about.slice(0, 1500)}`,
    webText && `From a web search:\n${webText}`,
  ]
    .filter(Boolean)
    .join("\n");

  const out = await grokStructured<{ background?: string; relevance?: string }>({
    system:
      "You write a short, factual profile of a professional contact from the PROVIDED FACTS ONLY. Never invent titles, employers, schools, or achievements not in the facts. If a detail is unknown, omit it. Write plainly, no em-dashes.",
    user:
      `THE PERSON (use only these facts):\n${factLines}\n\n` +
      (me ? `ABOUT THE USER this contact is being saved for:\n${me}\n\n` : "") +
      `Return two things:\n` +
      `background: 2 to 4 sentences on who they are, what they do, and where they studied, from the facts only.\n` +
      `relevance: 1 to 2 sentences on why they may matter to the user, grounded in who the user is and what this person does. If there is no clear link, give an honest neutral one (a shared field or school). Do not overstate.`,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { background: { type: "string" }, relevance: { type: "string" } },
      required: ["background", "relevance"],
    },
    schemaName: "contact_profile",
    maxTokens: 600,
  });
  return {
    background: (out?.background ?? "").trim() || (facts.about ?? "").slice(0, 800),
    relevance: (out?.relevance ?? "").trim(),
  };
}

/**
 * Add ONE contact from a pasted LinkedIn profile URL.
 *
 * The user hands Jarvis a specific person's link and wants them in the Contacts tab with as much
 * filled in as possible. We enrich from two independent sources and merge:
 *   • the page itself (scrapeLinkedInProfile, via the user's own logged-in window) → name, headline,
 *     current role/company, location, the About bio;
 *   • Apollo (apolloMatchPerson by linkedin_url) → the work email LinkedIn hides, plus a clean
 *     title/org to cross-fill.
 * Either source alone is enough to create a useful contact; with neither configured we say so plainly
 * instead of silently saving a bare link.
 *
 * This is an explicit, single-person user action (the user chose THIS person), so the contact lands
 * `created_by='user'`, `review_status='accepted'`, straight into the People tab, exactly like the
 * manual "Add a contact" form and the Apollo "Find email" flow. It is NOT autonomous discovery (that
 * path, cohort search, LinkedIn people-search, still goes to Review per hard rule #5).
 *
 * Provenance (hard rule #3): every filled field records its origin in `field_sources` (the LinkedIn
 * profile URL for page-read fields, apollo.io for Apollo-supplied ones), and `source_quote` carries
 * the headline so the card renders a working source chip (hard rule #4). No `sources` row is created:
 * `sources.source_type` has no 'linkedin' value, and a user-created contact needs no source_id to
 * satisfy `contacts_provenance_chk`.
 */

export type ImportLinkedInResult = {
  ok: boolean;
  contactId: string | null;
  fullName: string | null;
  /** True when this profile was already saved, we returned the existing contact, no duplicate made. */
  alreadyExisted: boolean;
  /** True when LinkedIn showed an auth wall and we had no other way in, log in and retry. */
  needsLogin: boolean;
  email: string | null;
  company: string | null;
  roleTitle: string | null;
  /** Which enrichment sources actually contributed (drives an honest message). */
  usedBrowser: boolean;
  usedApollo: boolean;
  message: string;
};

type FieldSource = { url?: string; quote?: string; confidence?: number; status?: string };

/** The /in/<slug> identity, lowercased, for dedup against contacts already saved. */
function slugOf(url: string): string {
  const m = (url || "").match(/\/in\/([^/?#\s]+)/i);
  if (!m) return (url || "").toLowerCase();
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}

export async function importContactFromLinkedIn(
  supabase: SupabaseClient,
  userId: string,
  rawUrl: string,
  /** The name the user gave us, used when the scrape/Apollo can't determine it, so a URL still yields a card. */
  fallbackName?: string,
): Promise<ImportLinkedInResult> {
  const base = (over: Partial<ImportLinkedInResult>): ImportLinkedInResult => ({
    ok: false,
    contactId: null,
    fullName: null,
    alreadyExisted: false,
    needsLogin: false,
    email: null,
    company: null,
    roleTitle: null,
    usedBrowser: false,
    usedApollo: false,
    message: "",
    ...over,
  });

  const profileUrl = normalizeLinkedInProfileUrl(rawUrl);
  if (!profileUrl) {
    return base({
      message: "That doesn't look like a LinkedIn profile URL. Paste a link like https://www.linkedin.com/in/their-handle.",
    });
  }
  const slug = slugOf(profileUrl);

  // Dedup: if we already have this profile (in any review state), return it rather than duplicating.
  const { data: existing } = await supabase
    .from("contacts")
    .select("id, full_name, contact_channels(kind, value)")
    .eq("user_id", userId);
  for (const c of (existing ?? []) as { id: string; full_name: string; contact_channels?: { kind: string; value: string }[] }[]) {
    for (const ch of c.contact_channels ?? []) {
      if (ch.kind === "linkedin" && ch.value && slugOf(ch.value) === slug) {
        return base({ ok: true, alreadyExisted: true, contactId: c.id, fullName: c.full_name, message: `${c.full_name} is already in your contacts.` });
      }
    }
  }

  // Tier A, read the page (best-effort; returns unavailable when the browser backend is off).
  let profile: LinkedInProfile | null = null;
  let needsLogin = false;
  let usedBrowser = false;
  const linkedInLogin = await getCredentialForSite(supabase, userId, "linkedin.com");
  const scraped = await scrapeLinkedInProfile(profileUrl, { userId, login: linkedInLogin });
  if (scraped.ok) {
    profile = scraped.profile;
    usedBrowser = true;
  } else if (scraped.reason === "needs_login") {
    needsLogin = true;
  }

  // Tier B, Apollo by LinkedIn URL (the only reliable source of a work email; needs no browser).
  let apollo: ApolloPerson | null = null;
  let usedApollo = false;
  if (apolloEnabled()) {
    apollo = await apolloMatchPerson({ linkedinUrl: profileUrl, name: profile?.name });
    if (apollo) usedApollo = true;
  }

  // Prefer a scraped/Apollo name; fall back to the name the user gave so a known URL always makes a card.
  const fullName = (profile?.name || apollo?.name || (fallbackName ?? "")).trim();
  if (!fullName) {
    if (needsLogin) {
      return base({ needsLogin: true, message: "Log into LinkedIn in the window Jarvis opened, then import the profile again." });
    }
    if (!apolloEnabled() && !usedBrowser) {
      return base({
        message:
          "To read a profile from just its URL I need either the browser backend (set JARVIS_BROWSER=playwright and log into LinkedIn once) or APOLLO_API_KEY.",
      });
    }
    return base({ message: "Couldn't identify anyone from that profile, it may be private, or the read was blocked. Try again, or add them manually." });
  }

  // ── Merge. Prefer the page for the role/company VALUE (it's what's visibly on their profile, and it
  // makes the LinkedIn URL the card's primary source); fall back to Apollo, attributing each field to
  // wherever its value actually came from.
  let roleTitle: string | null = null;
  let roleSrcUrl: string | undefined;
  let roleQuote: string | undefined;
  if (profile?.title || profile?.headline) {
    roleTitle = (profile.title || profile.headline)!.trim();
    roleSrcUrl = profileUrl;
    roleQuote = profile.headline;
  } else if (apollo?.title) {
    roleTitle = apollo.title.trim();
    roleSrcUrl = "https://apollo.io";
    roleQuote = "Title from Apollo.io.";
  }

  let company: string | null = null;
  let companySrcUrl: string | undefined;
  if (profile?.company) {
    company = profile.company.trim();
    companySrcUrl = profileUrl;
  } else if (apollo?.organization) {
    company = apollo.organization.trim();
    companySrcUrl = "https://apollo.io";
  }

  const location = (profile?.location || "").trim();
  const email = apollo?.email?.trim() || null;
  const emailStatus = apollo?.emailStatus;

  // Rich, grounded "who they are" + "why they matter to me" (best-effort; falls back to the raw About).
  const enriched = await enrichSummary(supabase, userId, {
    name: fullName,
    headline: profile?.headline,
    roleTitle: roleTitle ?? undefined,
    company: company ?? undefined,
    location: location || undefined,
    about: profile?.about,
    education: profile?.education,
  });
  const background = enriched.background.trim() || null;

  // field_sources insertion order matters: the first url-bearing entry becomes the card's primary
  // permalink (see rowsToPerson), so page-read fields (LinkedIn URL) go before the Apollo email.
  const fieldSources: Record<string, FieldSource> = {};
  if (roleTitle) fieldSources.role_title = { url: roleSrcUrl, quote: roleQuote, confidence: roleSrcUrl === profileUrl ? 0.7 : 0.6 };
  if (company) {
    fieldSources.company = {
      url: companySrcUrl,
      quote: companySrcUrl === profileUrl ? "Current employer on their LinkedIn profile." : "Organization via Apollo.io.",
      confidence: companySrcUrl === profileUrl ? 0.7 : 0.6,
    };
  }
  if (background) fieldSources.background = { url: profileUrl, quote: "Summary from their LinkedIn profile and web research.", confidence: 0.7 };
  if (email) {
    fieldSources.email = {
      url: "https://apollo.io",
      quote: `Work email via Apollo.io (${emailStatus ?? "unverified"}).`,
      confidence: emailStatus === "verified" ? 0.9 : 0.6,
      status: emailStatus === "verified" ? "verified" : "unconfirmed",
    };
  }

  const headline = profile?.headline?.trim();
  const sourceQuote =
    (headline || [roleTitle, company].filter(Boolean).join(" at ") || `LinkedIn profile: ${profileUrl}`).slice(0, 500);
  const confidence = email && emailStatus === "verified" ? 0.9 : usedBrowser ? 0.75 : usedApollo ? 0.65 : 0.5;
  // Always keep a url-bearing field_sources entry (the profile itself) so the card's source chip links
  // back even for a sparse profile that yielded no role/company/bio/email (rowsToPerson picks the first
  // field_sources url as the card's permalink).
  if (!Object.values(fieldSources).some((v) => v?.url)) {
    fieldSources.profile = { url: profileUrl, quote: sourceQuote, confidence };
  }

  const relevance = enriched.relevance || ["Found via LinkedIn.", location].filter(Boolean).join(" · ");
  const noteBits: string[] = [];
  if (!email && apolloEnabled()) {
    noteBits.push(
      usedApollo
        ? "Apollo matched this person but returned no unlocked work email (your Apollo plan may need credits to reveal it)."
        : "Apollo had no record of this LinkedIn profile, so no work email.",
    );
  }
  if (!email && !apolloEnabled()) noteBits.push("Set APOLLO_API_KEY to auto-find their work email.");
  if (!usedBrowser && needsLogin) noteBits.push("LinkedIn page details were skipped (not logged in).");
  const notes = noteBits.join(" ") || null;

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      user_id: userId,
      full_name: fullName,
      company,
      role_title: roleTitle,
      background,
      relevance,
      notes,
      source_quote: sourceQuote,
      confidence,
      field_sources: fieldSources,
      created_by: "user",
      review_status: "accepted",
    })
    .select("id")
    .single();
  if (error || !contact) return base({ message: error?.message ?? "Couldn't save the contact." });
  const contactId = contact.id as string;

  const channels: { contact_id: string; kind: string; value: string; is_primary: boolean }[] = [
    { contact_id: contactId, kind: "linkedin", value: profileUrl, is_primary: !email },
  ];
  if (email) channels.push({ contact_id: contactId, kind: "email", value: email, is_primary: true });
  // The contact row already exists (and renders via source_quote/field_sources), so a channels
  // failure isn't fatal, but it leaves the contact without its link/email, so surface it plainly
  // rather than silently claiming we saved everything.
  const { error: channelsError } = await supabase.from("contact_channels").insert(channels);
  if (channelsError) console.warn(`[import-linkedin] channel insert failed for ${contactId}: ${channelsError.message}`);
  const channelNote = channelsError ? " (couldn't save their link/email, open the contact to add it)" : "";

  const got = [email && "email", roleTitle && "role", company && "company", background && "bio"].filter(Boolean) as string[];
  const gotStr = got.length ? ` (${got.join(", ")})` : "";
  const tail = needsLogin
    ? " I saved the link but couldn't read the profile, log into LinkedIn in the window I opened, then ask again to fill in their role and bio."
    : !usedBrowser && !usedApollo
      ? " I saved the link; to auto-fill their role, bio, and email, set JARVIS_BROWSER=playwright (and log into LinkedIn) or APOLLO_API_KEY."
      : !email && apolloEnabled()
        ? " No work email was available."
        : !apolloEnabled()
          ? " Set APOLLO_API_KEY to also pull their work email."
          : "";
  const message = `Added ${fullName} to your contacts${gotStr}.${tail}${channelNote}`;

  return { ok: true, contactId, fullName, alreadyExisted: false, needsLogin: false, email, company, roleTitle, usedBrowser, usedApollo, message };
}
