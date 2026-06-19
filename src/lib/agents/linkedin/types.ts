/**
 * LinkedIn contact-sourcing agent — types.
 *
 * What it is: given a job/grant the user has linked (an application run or an opportunity, or a raw
 * org + role), Jarvis drives a REAL, logged-in browser (the user's own LinkedIn session, persisted on
 * disk) to a People search, reads the result cards, and lands the discovered people in the Review queue
 * as suggested contacts — each with the LinkedIn profile URL and the on-page headline as provenance.
 *
 * Boundaries (deliberate, honest):
 * - Uses the USER'S OWN authenticated session in a visible window. It is the user browsing their own
 *   account, one page, rate-limited — not a headless mass-scrape. LinkedIn's markup shifts often, so the
 *   reader is best-effort by design.
 * - Reads only what the search results page renders (name, headline, location, profile URL). It never
 *   logs in for the user, never sends connection requests, never messages anyone.
 * - Discovered people land at `review_status='review'` (autonomy L0). Nothing reaches the People tab
 *   until the user accepts it; from there the existing Outreach button drafts the email.
 */

export type LinkedInPerson = {
  name: string;
  profileUrl: string;
  headline: string;
  location: string;
};

/** Result of one search pass against the live results page. */
export type LinkedInSearchResult =
  | { ok: true; people: LinkedInPerson[] }
  | {
      ok: false;
      reason: "unavailable" | "needs_login" | "error";
      message: string;
    };

/** What the user/card hands the scrape: an application or opportunity to resolve, or a raw org+role. */
export type LinkedInScrapeInput = {
  applicationId?: string | null;
  opportunityId?: string | null;
  org?: string | null;
  role?: string | null;
  /** Optional freeform search query override (otherwise derived from org + a role hint). */
  query?: string | null;
  limit?: number | null;
};

/** Outcome of a full scrape: search + persist into the Review queue. */
export type LinkedInScrapeResult = {
  ok: boolean;
  /** True when the visible window is sitting on LinkedIn's login — the user must sign in and retry. */
  needsLogin: boolean;
  /** People read off the results page (before dedup). */
  found: number;
  /** New contacts written to the Review queue (after skipping ones already saved). */
  inserted: number;
  /** Already-saved profiles skipped this run. */
  skipped: number;
  /** The search query actually used. */
  query: string;
  /** The research_run row grouping these suggestions (null on failure / login). */
  researchRunId: string | null;
  /** Human-facing one-liner for the UI. */
  message: string;
};
