import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apolloEnabled, apolloMatchPerson, type ApolloPerson } from "@/lib/apollo";

/**
 * validate-enrich: take contacts that came from a Google Sheet (or any review run) and, for each one,
 *   (a) VALIDATE the contact info already in the row — is the email a real address, and does it match
 *       what an authoritative source (Apollo.io) has on file for that person? and
 *   (b) ENRICH the missing pieces — fill an absent email / company / title / LinkedIn from Apollo.
 *
 * This is the "fill in the missing pieces and validate that the spreadsheet contact info is correct"
 * half of the importer. It runs as a second pass over already-imported rows so import stays fast and
 * deterministic, and so validation can run again on demand (a button) or after a re-import.
 *
 * Two tiers, and it degrades gracefully:
 *   • Tier 1 (always, no API key): deterministic FORMAT checks — a malformed email/LinkedIn is flagged
 *     "invalid" purely from its shape. Never guesses.
 *   • Tier 2 (only when APOLLO_API_KEY is set): cross-check the existing email against Apollo's record
 *     and fill blanks. With no key, Tier 2 is skipped and we report apolloUsed:false — the feature
 *     still validates formats, it just can't confirm against a third party.
 *
 * Provenance (hard rule #3): every verdict and every filled value is written into the contact's
 * `field_sources` jsonb with a human-readable quote + a confidence + a machine status, so the card can
 * show WHY a field is trusted/suspect and where it came from. We never touch a contact's primary
 * `source_id`/`source_quote` (that stays the sheet row). And because these contacts are still in the
 * Review queue (L0, hard rule #5), the user re-reviews every enriched/flagged field before accepting.
 */

export type EmailCheck = "verified" | "mismatch" | "unconfirmed" | "invalid" | "none";
export type LinkCheck = "valid" | "invalid" | "none";

export type ContactValidation = {
  contactId: string;
  fullName: string;
  email: EmailCheck;
  linkedin: LinkCheck;
  enriched: string[]; // field names we filled from Apollo (e.g. ["email", "company"])
  note: string; // one-line human summary
};

export type ValidateEnrichResult = {
  checked: number;
  apolloUsed: boolean;
  enrichedCount: number; // contacts that gained at least one field
  flaggedCount: number; // contacts whose existing email is invalid or mismatched
  results: ContactValidation[];
};

export type ValidateEnrichOpts = {
  contactIds?: string[]; // validate exactly these
  researchRunId?: string; // …or every contact from this run
  scope?: "review" | "accepted"; // …or all of the user's contacts in this lifecycle state
  limit?: number; // hard cap on rows touched per call (default 25) — keeps us under maxDuration
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 60;
const POOL = 5; // concurrent Apollo lookups — bounded so a batch returns well under the route timeout

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A syntactically plausible email — Tier-1 format gate (NOT deliverability). */
function isLikelyEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

/** A plausible LinkedIn URL or bare handle. Spaces / '@' / obvious non-URLs fail. */
function isLikelyLinkedIn(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/linkedin\.com\/(in|pub|company)\//i.test(s)) return true;
  // A bare handle a sheet might store ("jane-doe-1234") — letters/digits/hyphens, no spaces or '@'.
  return /^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])$/i.test(s) && !s.includes("@");
}

function normEmail(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

type ChannelRow = { id: string; kind: string; value: string; is_primary: boolean | null };
type ContactRow = {
  id: string;
  full_name: string;
  company: string | null;
  role_title: string | null;
  field_sources: Record<string, { url?: string; quote?: string; confidence?: number; status?: string }> | null;
};

/** Run `fn` over `items` with at most `n` in flight at once (preserves input order in the output). */
async function mapPool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** Resolve which contacts to act on, honouring RLS (the caller's supabase client is user-scoped). */
async function loadTargets(
  supabase: SupabaseClient,
  opts: ValidateEnrichOpts,
): Promise<ContactRow[]> {
  const cols = "id, full_name, company, role_title, field_sources";
  let q = supabase.from("contacts").select(cols).order("created_at", { ascending: true });
  if (opts.contactIds?.length) {
    q = q.in("id", opts.contactIds);
  } else if (opts.researchRunId) {
    q = q.eq("research_run_id", opts.researchRunId).in("review_status", ["review", "accepted"]);
  } else {
    q = q.eq("review_status", opts.scope === "accepted" ? "accepted" : "review");
  }
  const { data } = await q.limit(Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT)));
  return (data ?? []) as unknown as ContactRow[];
}

/**
 * Insert a filled contact channel, dedup-safe under concurrent validate calls.
 *
 * `contact_channels` has no UNIQUE(contact_id, kind, value) constraint, so two near-simultaneous
 * validate runs (e.g. a double-click, or import-auto-run racing a manual click) could each see "no
 * email yet" and both insert — leaving duplicate rows. We guard in three layers: (1) a fresh existence
 * re-check right before inserting (the snapshot in processOne can be stale), (2) the insert, then
 * (3) a prune that, if a concurrent insert still slipped a duplicate of this exact value in, keeps a
 * single deterministic row (lowest id) and deletes the rest. Both racing callers compute the same
 * "keep lowest id", so they converge to one row. Returns true only when THIS call added the channel.
 *
 * (A UNIQUE(contact_id, kind, value) constraint would be the airtight fix — noted for Aarav as a
 * follow-up migration; we never apply migrations to the live DB ourselves.)
 */
async function fillChannel(
  supabase: SupabaseClient,
  contactId: string,
  kind: string,
  value: string,
  isPrimary: boolean,
): Promise<boolean> {
  const { data: pre } = await supabase
    .from("contact_channels")
    .select("id")
    .eq("contact_id", contactId)
    .eq("kind", kind)
    .eq("value", value)
    .limit(1);
  if (pre && pre.length) return false; // already present — nothing to fill

  const { error } = await supabase
    .from("contact_channels")
    .insert({ contact_id: contactId, kind, value, is_primary: isPrimary });
  if (error) {
    // Don't crash the batch on one bad insert; the next validate run re-attempts (no verdict is
    // written for this field, so it isn't falsely reported as filled).
    console.warn(`[validate-enrich] ${kind} channel fill failed for ${contactId}`);
    return false;
  }

  const { data: dupes } = await supabase
    .from("contact_channels")
    .select("id")
    .eq("contact_id", contactId)
    .eq("kind", kind)
    .eq("value", value)
    .order("id", { ascending: true });
  if (dupes && dupes.length > 1) {
    await supabase.from("contact_channels").delete().in("id", dupes.slice(1).map((r) => r.id as string));
  }
  return true;
}

/**
 * Validate + enrich one contact. Reads its channels, runs Tier-1 format checks, optionally cross-checks
 * & fills from Apollo, then persists: merged field_sources verdicts + any newly-filled company/title,
 * and upserts a filled email/linkedin channel. All writes are RLS-scoped to the caller.
 */
async function processOne(
  supabase: SupabaseClient,
  contact: ContactRow,
  useApollo: boolean,
): Promise<ContactValidation> {
  const { data: chData } = await supabase
    .from("contact_channels")
    .select("id, kind, value, is_primary")
    .eq("contact_id", contact.id);
  const channels = (chData ?? []) as unknown as ChannelRow[];
  const emailCh = channels.find((c) => c.kind === "email" && c.value?.trim());
  const linkedinCh = channels.find((c) => c.kind === "linkedin" && c.value?.trim());

  const fieldSources: Record<string, { url?: string; quote?: string; confidence?: number; status?: string }> = {
    ...(contact.field_sources ?? {}),
  };
  const contactPatch: { company?: string; role_title?: string } = {};
  const enriched: string[] = [];
  let emailCheck: EmailCheck = "none";
  let linkCheck: LinkCheck = "none";

  // ---- Tier 1: deterministic format checks on what the sheet already gave us --------------------
  if (emailCh) emailCheck = isLikelyEmail(emailCh.value) ? "unconfirmed" : "invalid";
  if (linkedinCh) linkCheck = isLikelyLinkedIn(linkedinCh.value) ? "valid" : "invalid";

  // ---- Tier 2: cross-check + fill blanks from Apollo (only with a key) --------------------------
  let match: ApolloPerson | null = null;
  if (useApollo) {
    match = await apolloMatchPerson({
      name: contact.full_name,
      company: contact.company ?? undefined,
      linkedinUrl: linkedinCh?.value,
    });
  }

  if (match) {
    const apolloEmail = match.email; // realEmail()-filtered upstream (undefined for locked rows)

    if (emailCh && emailCheck !== "invalid" && apolloEmail) {
      // The row HAS an email and Apollo has one too — do they agree?
      // Note: no `url` on these verdicts. The email VALUE came from the sheet (the contact's primary
      // source), not from Apollo — Apollo only vouches for it. Setting url: apollo.io here would make
      // rowsToPerson pick Apollo as the card's primary permalink, mis-attributing the cohort source.
      // The quote names Apollo, so the verifier is still identifiable.
      if (normEmail(emailCh.value) === normEmail(apolloEmail)) {
        emailCheck = "verified";
        fieldSources.email = {
          quote: `Sheet email confirmed by Apollo.io (status: ${match.emailStatus ?? "match"}).`,
          confidence: match.emailStatus === "verified" ? 0.95 : 0.8,
          status: "verified",
        };
      } else {
        emailCheck = "mismatch";
        fieldSources.email = {
          quote: `Sheet has "${emailCh.value}", but Apollo.io lists "${apolloEmail}" for this person — verify before using.`,
          confidence: 0.35,
          status: "mismatch",
        };
      }
    } else if (!emailCh && apolloEmail) {
      // The row was MISSING an email — fill it from Apollo (dedup-safe under concurrent calls).
      const did = await fillChannel(supabase, contact.id, "email", apolloEmail, !linkedinCh);
      if (did) {
        emailCheck = match.emailStatus === "verified" ? "verified" : "unconfirmed";
        enriched.push("email");
        fieldSources.email = {
          url: "https://apollo.io",
          quote: `Filled from Apollo.io (email status: ${match.emailStatus ?? "match"}).`,
          confidence: match.emailStatus === "verified" ? 0.9 : 0.7,
          status: emailCheck,
        };
      }
    }

    // Fill an absent company / title from Apollo (never overwrite what the sheet provided).
    if (!contact.company && match.organization) {
      contactPatch.company = match.organization;
      enriched.push("company");
      fieldSources.company = {
        url: "https://apollo.io",
        quote: `Filled from Apollo.io: ${match.organization}.`,
        confidence: 0.75,
        status: "enriched",
      };
    }
    if (!contact.role_title && match.title) {
      contactPatch.role_title = match.title;
      enriched.push("role_title");
      fieldSources.role_title = {
        url: "https://apollo.io",
        quote: `Filled from Apollo.io: ${match.title}.`,
        confidence: 0.75,
        status: "enriched",
      };
    }
    // Fill an absent LinkedIn from Apollo (dedup-safe under concurrent calls).
    if (!linkedinCh && match.linkedinUrl) {
      const did = await fillChannel(supabase, contact.id, "linkedin", match.linkedinUrl, false);
      if (did) {
        linkCheck = "valid";
        enriched.push("linkedin");
        fieldSources.linkedin = {
          url: "https://apollo.io",
          quote: `Filled from Apollo.io.`,
          confidence: 0.7,
          status: "enriched",
        };
      }
    }
  }

  // If we have an existing email but couldn't cross-check it (no key, or Apollo had nothing), still
  // record the Tier-1 verdict so the card shows "format-checked, not confirmed" rather than nothing.
  if (emailCh && (emailCheck === "unconfirmed" || emailCheck === "invalid") && !fieldSources.email?.status) {
    fieldSources.email = {
      quote:
        emailCheck === "invalid"
          ? `"${emailCh.value}" isn't a valid email address — fix it before reaching out.`
          : useApollo
            ? `Format looks valid; Apollo.io had no record to confirm it against.`
            : `Format looks valid (not cross-checked — Apollo.io isn't configured).`,
      confidence: emailCheck === "invalid" ? 0.1 : 0.5,
      status: emailCheck,
    };
  }
  if (linkedinCh && linkCheck === "invalid" && !fieldSources.linkedin?.status) {
    fieldSources.linkedin = {
      quote: `"${linkedinCh.value}" doesn't look like a valid LinkedIn profile.`,
      confidence: 0.1,
      status: "invalid",
    };
  }

  // ---- Persist -------------------------------------------------------------------------------------
  const update: Record<string, unknown> = { field_sources: fieldSources };
  if (contactPatch.company) update.company = contactPatch.company;
  if (contactPatch.role_title) update.role_title = contactPatch.role_title;
  await supabase.from("contacts").update(update).eq("id", contact.id);

  const note = buildNote(emailCheck, linkCheck, enriched);
  return { contactId: contact.id, fullName: contact.full_name, email: emailCheck, linkedin: linkCheck, enriched, note };
}

function buildNote(email: EmailCheck, link: LinkCheck, enriched: string[]): string {
  const parts: string[] = [];
  if (email === "verified") parts.push("email confirmed");
  else if (email === "mismatch") parts.push("email disagrees with Apollo");
  else if (email === "invalid") parts.push("email is malformed");
  else if (email === "unconfirmed") parts.push("email format-checked");
  if (link === "invalid") parts.push("LinkedIn looks invalid");
  if (enriched.length) parts.push(`filled ${enriched.join(", ")}`);
  return parts.length ? parts.join(" · ") : "nothing to validate or fill";
}

export async function validateAndEnrichContacts(
  supabase: SupabaseClient,
  _userId: string,
  opts: ValidateEnrichOpts = {},
): Promise<ValidateEnrichResult> {
  const useApollo = apolloEnabled();
  const targets = await loadTargets(supabase, opts);

  const results = await mapPool(targets, POOL, async (c) => {
    try {
      return await processOne(supabase, c, useApollo);
    } catch {
      // One contact's failure (a flaky Apollo call, a bad row) must not sink the whole batch.
      return {
        contactId: c.id,
        fullName: c.full_name,
        email: "none" as EmailCheck,
        linkedin: "none" as LinkCheck,
        enriched: [],
        note: "couldn't validate (skipped)",
      };
    }
  });

  const enrichedCount = results.filter((r) => r.enriched.length > 0).length;
  const flaggedCount = results.filter((r) => r.email === "invalid" || r.email === "mismatch").length;
  return { checked: results.length, apolloUsed: useApollo, enrichedCount, flaggedCount, results };
}
