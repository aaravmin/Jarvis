import "server-only";
import os from "os";
import path from "path";
import { browserEnabled, launchPersistentContext, type PwPage, type PwPersistentContext } from "@/lib/agents/application/browser";
import type { LinkedInPerson, LinkedInSearchResult } from "./types";

/**
 * The LinkedIn "eyes": drive the user's own logged-in browser to a People search and read the result
 * cards. See ./types.ts for the boundaries. This module owns ONE persistent, headed browser context
 * (a real on-disk profile) kept alive on globalThis so the LinkedIn login survives between calls and
 * across Next's dev HMR. We never launch a second context against the same profile dir (Chromium locks
 * it), so callers always go through getContext().
 */

const RESULTS_TIMEOUT_MS = 30_000;

/** Where the persistent Chromium profile (and thus the LinkedIn cookie) lives. Override per machine. */
function profileDir(): string {
  return process.env.LINKEDIN_USER_DATA_DIR || path.join(os.homedir(), ".jarvis-browser", "linkedin");
}

// ── Single long-lived context ─────────────────────────────────────────────────────────────────────
type Holder = { context: PwPersistentContext };
const g = globalThis as unknown as { __jarvisLinkedInCtx?: Holder | null };

async function getContext(): Promise<PwPersistentContext | null> {
  const existing = g.__jarvisLinkedInCtx?.context;
  if (existing) {
    try {
      existing.pages(); // throws if the context/browser was closed out from under us
      return existing;
    } catch {
      g.__jarvisLinkedInCtx = null;
    }
  }
  // Headed: a login needs a real window, and a genuine profile is far less bot-detectable.
  const context = await launchPersistentContext(profileDir(), { headless: false });
  if (!context) return null;
  g.__jarvisLinkedInCtx = { context };
  return context;
}

/** Drop our handle and close the window (e.g. to force a fresh login). Safe if nothing is open. */
export async function closeLinkedInContext(): Promise<void> {
  const c = g.__jarvisLinkedInCtx?.context;
  g.__jarvisLinkedInCtx = null;
  if (c) {
    try {
      await c.close();
    } catch {
      /* already gone */
    }
  }
}

function searchUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://www.linkedin.com/search/results/people/?keywords=${q}&origin=GLOBAL_SEARCH_HEADER`;
}

/** True when the page is sitting on a login / auth wall rather than real content. */
function isLoginWall(url: string): boolean {
  return /linkedin\.com\/(login|uas\/login|authwall|checkpoint)/i.test(url) || /\/signup/i.test(url);
}

/**
 * Read people off the rendered results page. Anchor-first (every result links to a `/in/<slug>`
 * profile), which is far more stable than LinkedIn's churning CSS class names. For each unique profile
 * we take the visible name from the anchor and the headline/location from the surrounding card.
 */
const PEOPLE_READER = `(() => {
  const clean = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const seen = new Set();
  const out = [];
  const anchors = Array.from(document.querySelectorAll('a[href*="/in/"]'));
  for (const a of anchors) {
    let href = a.href || "";
    const m = href.match(/\\/in\\/([^/?#]+)/);
    if (!m) continue;
    const slug = m[1];
    if (seen.has(slug)) continue;
    // Name: LinkedIn renders the visible name in a span[aria-hidden=true] inside the link, with a
    // visually-hidden "View X's profile" sibling. Prefer the aria-hidden span; fall back to link text.
    const nameEl = a.querySelector('span[aria-hidden="true"]');
    let name = clean(nameEl ? nameEl.textContent : a.textContent);
    name = name.split("\\n")[0].trim();
    if (!name) continue;
    if (/^view\\b/i.test(name)) continue;
    if (/linkedin member/i.test(name)) continue;     // out-of-network / anonymized
    if (name.length < 2 || name.length > 80) continue;
    // Card container: walk up to the list item, then read the subtitle lines.
    const card = a.closest("li") || a.closest('div[data-chameleon-result-urn]') || a.closest("div");
    let headline = "";
    let location = "";
    if (card) {
      const sub = card.querySelector('[class*="primary-subtitle"], .entity-result__primary-subtitle');
      const loc = card.querySelector('[class*="secondary-subtitle"], .entity-result__secondary-subtitle');
      headline = clean(sub ? sub.textContent : "");
      location = clean(loc ? loc.textContent : "");
    }
    seen.add(slug);
    out.push({ name, profileUrl: "https://www.linkedin.com/in/" + slug, headline, location });
  }
  return out;
})()`;

async function readPeople(page: PwPage): Promise<LinkedInPerson[]> {
  const raw = (await page.evaluate(PEOPLE_READER as unknown as () => LinkedInPerson[])) as LinkedInPerson[];
  return Array.isArray(raw) ? raw : [];
}

/**
 * Run one People search against the live, logged-in page. Returns the people found, or a typed reason
 * (unavailable when the browser backend is off, needs_login when the user must sign in — the window is
 * left open on the login page for exactly that).
 */
export async function searchLinkedInPeople(query: string, limit: number): Promise<LinkedInSearchResult> {
  if (!browserEnabled()) {
    return {
      ok: false,
      reason: "unavailable",
      message:
        "LinkedIn scraping needs the browser backend. Set JARVIS_BROWSER=playwright (and install Playwright) to turn it on.",
    };
  }

  const context = await getContext();
  if (!context) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Couldn't start the browser. Install Playwright (npm i playwright && npx playwright install chromium).",
    };
  }

  const page = context.pages()[0] ?? (await context.newPage());

  try {
    await page.goto(searchUrl(query), { waitUntil: "domcontentloaded", timeout: RESULTS_TIMEOUT_MS });
  } catch {
    return { ok: false, reason: "error", message: "LinkedIn didn't load in time. Try again in a moment." };
  }

  // If LinkedIn bounced us to a login/auth wall, surface it to the user and leave the window open there.
  if (isLoginWall(page.url())) {
    try {
      await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: RESULTS_TIMEOUT_MS });
      await page.bringToFront();
    } catch {
      /* best effort */
    }
    return {
      ok: false,
      reason: "needs_login",
      message: "Log into LinkedIn in the window Jarvis just opened, then click Find LinkedIn contacts again.",
    };
  }

  // Let the result list render (it's lazy). Best-effort wait, then a nudge-scroll to load more cards.
  try {
    await page.waitForSelector('a[href*="/in/"]', { timeout: RESULTS_TIMEOUT_MS });
  } catch {
    /* maybe no results, or a slow render — fall through and read whatever is there */
  }
  await page.waitForTimeout(1200);
  try {
    // Nudge-scroll to trigger LinkedIn's lazy-loading of more result cards. Passed as a string so TS
    // never types the page-context DOM globals; an IIFE so evaluate runs it (not just defines it).
    await page.evaluate("(() => { window.scrollTo(0, document.body.scrollHeight); })()" as unknown as () => void);
    await page.waitForTimeout(900);
  } catch {
    /* non-fatal */
  }

  let people = await readPeople(page);

  // Zero results on a non-wall URL can still mean an interstitial sign-in overlay — double-check.
  if (people.length === 0 && isLoginWall(page.url())) {
    return {
      ok: false,
      reason: "needs_login",
      message: "Log into LinkedIn in the open window, then click Find LinkedIn contacts again.",
    };
  }

  if (limit > 0) people = people.slice(0, limit);
  return { ok: true, people };
}
