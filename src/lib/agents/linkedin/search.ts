import "server-only";
import os from "os";
import path from "path";
import { browserEnabled, launchPersistentContext, type PwPage, type PwPersistentContext } from "@/lib/agents/application/browser";
import type { LinkedInPerson, LinkedInProfile, LinkedInProfileResult, LinkedInSearchResult } from "./types";

/**
 * The LinkedIn "eyes": drive the user's own logged-in browser to a People search and read the result
 * cards. See ./types.ts for the boundaries. This module owns ONE persistent, headed browser context
 * (a real on-disk profile) kept alive on globalThis so the LinkedIn login survives between calls and
 * across Next's dev HMR. We never launch a second context against the same profile dir (Chromium locks
 * it), so callers always go through getContext().
 */

const RESULTS_TIMEOUT_MS = 30_000;

/** A decrypted site login the caller fetched from the vault, for auto-sign-in. */
export type LinkedInLogin = { username: string | null; password: string };
/** Per-call options: whose browser profile to use, and an optional saved login to auto-fill. */
export type ScrapeOpts = { userId?: string | null; login?: LinkedInLogin | null };

/**
 * Where the persistent Chromium profile (and thus the LinkedIn cookie) lives, namespaced PER USER so a
 * multi-user deployment never shares one LinkedIn session across accounts. Override the base per machine
 * with LINKEDIN_USER_DATA_DIR.
 */
function profileDir(userId?: string | null): string {
  const base = process.env.LINKEDIN_USER_DATA_DIR || path.join(os.homedir(), ".jarvis-browser", "linkedin");
  return userId ? path.join(base, userId) : base;
}

// ── Long-lived contexts, one per user ──────────────────────────────────────────────────────────────
type Holder = { context: PwPersistentContext };
const g = globalThis as unknown as { __jarvisLinkedInCtxByUser?: Map<string, Holder> };
function holders(): Map<string, Holder> {
  return (g.__jarvisLinkedInCtxByUser ??= new Map());
}

async function getContext(userId?: string | null): Promise<PwPersistentContext | null> {
  const key = userId || "__default__";
  const map = holders();
  const existing = map.get(key)?.context;
  if (existing) {
    try {
      existing.pages(); // throws if the context/browser was closed out from under us
      return existing;
    } catch {
      map.delete(key);
    }
  }
  // Headed: a login needs a real window, and a genuine profile is far less bot-detectable.
  const context = await launchPersistentContext(profileDir(userId), { headless: false });
  if (!context) return null;
  map.set(key, { context });
  return context;
}

/** Close every open context (e.g. to force a fresh login). Safe if nothing is open. */
export async function closeLinkedInContext(): Promise<void> {
  const map = g.__jarvisLinkedInCtxByUser;
  if (!map) return;
  for (const h of map.values()) {
    try {
      await h.context.close();
    } catch {
      /* already gone */
    }
  }
  map.clear();
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
 * Best-effort auto-login with a saved credential. Fills LinkedIn's #username + #password and submits.
 * Returns true only if we end up OFF the login/auth wall. LinkedIn may still demand a 2FA or captcha
 * checkpoint, in which case this returns false and the caller falls back to asking the user to finish
 * signing in manually. Requires both a username and a password.
 */
async function tryAutoLogin(page: PwPage, login: LinkedInLogin): Promise<boolean> {
  if (!login.username || !login.password) return false;
  try {
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: RESULTS_TIMEOUT_MS });
    await page.waitForSelector("#username, #password", { timeout: 8000 }).catch(() => {});
    await page.locator("#username").fill(login.username).catch(() => {});
    await page.locator("#password").fill(login.password).catch(() => {});
    await page.locator('button[type="submit"]').click().catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: RESULTS_TIMEOUT_MS }).catch(() => {});
    await page.waitForTimeout(1500);
    return !isLoginWall(page.url());
  } catch {
    return false;
  }
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
 * (unavailable when the browser backend is off, needs_login when the user must sign in, the window is
 * left open on the login page for exactly that).
 */
export async function searchLinkedInPeople(query: string, limit: number, opts?: ScrapeOpts): Promise<LinkedInSearchResult> {
  if (!browserEnabled()) {
    return {
      ok: false,
      reason: "unavailable",
      message:
        "LinkedIn scraping needs the browser backend. Set JARVIS_BROWSER=playwright (and install Playwright) to turn it on.",
    };
  }

  const context = await getContext(opts?.userId);
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

  // If LinkedIn bounced us to a login/auth wall, try the saved login first; if that doesn't clear it,
  // leave the window open on the login page for the user to finish.
  if (isLoginWall(page.url())) {
    if (opts?.login && (await tryAutoLogin(page, opts.login))) {
      try {
        await page.goto(searchUrl(query), { waitUntil: "domcontentloaded", timeout: RESULTS_TIMEOUT_MS });
      } catch {
        /* fall through to the wall check below */
      }
    }
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
        message: opts?.login?.username
          ? "I tried your saved LinkedIn login but it did not get through (LinkedIn may want a verification step). Finish signing in in the open window, then try again."
          : "Log into LinkedIn in the window Jarvis just opened, then click Find LinkedIn contacts again.",
      };
    }
  }

  // Let the result list render (it's lazy). Best-effort wait, then a nudge-scroll to load more cards.
  try {
    await page.waitForSelector('a[href*="/in/"]', { timeout: RESULTS_TIMEOUT_MS });
  } catch {
    /* maybe no results, or a slow render, fall through and read whatever is there */
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

  // Zero results on a non-wall URL can still mean an interstitial sign-in overlay, double-check.
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

// ── Single profile scrape ───────────────────────────────────────────────────────────────────────
const PROFILE_TIMEOUT_MS = 30_000;

/** Normalize any LinkedIn profile link to the canonical https://www.linkedin.com/in/<slug>. Null if
 *  it isn't a /in/ profile URL (company pages, posts, etc. aren't people). */
export function normalizeLinkedInProfileUrl(url: string): string | null {
  const m = (url || "").match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  // decodeURIComponent throws on a malformed %-sequence in a pasted link, fall back to the raw slug.
  let slug = m[1];
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    /* keep raw */
  }
  return `https://www.linkedin.com/in/${slug.toLowerCase()}`;
}

/**
 * Read one profile page. Anchored on stable structures where possible (h1, the #about / #experience
 * section anchors, the page <title> and og:description) rather than LinkedIn's churning utility class
 * names, with several fallbacks each. Everything is best-effort, an out-of-network profile or a
 * shifted layout simply yields fewer fields; the orchestrator backfills the email from Apollo.
 */
const PROFILE_READER = `(() => {
  const clean = (s) => (s || "").replace(/\\s+/g, " ").trim();
  const out = {};
  const h1 = document.querySelector("main h1") || document.querySelector("h1");
  out.name = clean(h1 && h1.textContent);
  const head =
    document.querySelector("main .text-body-medium.break-words") ||
    document.querySelector(".text-body-medium.break-words") ||
    document.querySelector("main .text-body-medium");
  out.headline = clean(head && head.textContent);
  const loc =
    document.querySelector("main .pv-text-details__left-panel .text-body-small") ||
    document.querySelector(".text-body-small.inline.t-black--light.break-words");
  out.location = clean(loc && loc.textContent);
  // About: the #about anchor sits inside its section; the long-form copy is the visually-hidden span.
  let about = "";
  const aboutAnchor = document.getElementById("about");
  const aboutSection = aboutAnchor ? aboutAnchor.closest("section") : null;
  if (aboutSection) {
    const span =
      aboutSection.querySelector(".inline-show-more-text span[aria-hidden=\\"true\\"]") ||
      aboutSection.querySelector("span[aria-hidden=\\"true\\"]");
    about = clean(span && span.textContent);
  }
  out.about = about.slice(0, 1200);
  // First experience entry → current title + company.
  const expAnchor = document.getElementById("experience");
  const expSection = expAnchor ? expAnchor.closest("section") : null;
  if (expSection) {
    const item = expSection.querySelector("li");
    if (item) {
      const bold = item.querySelector("span[aria-hidden=\\"true\\"]");
      out.expTitle = clean(bold && bold.textContent);
      const subs = item.querySelectorAll(".t-14.t-normal span[aria-hidden=\\"true\\"]");
      if (subs && subs[0]) out.expCompany = clean(subs[0].textContent).split(" · ")[0];
    }
  }
  // Education: read up to 3 schools from the #education section.
  const eduAnchor = document.getElementById("education");
  const eduSection = eduAnchor ? eduAnchor.closest("section") : null;
  const schools = [];
  if (eduSection) {
    const items = eduSection.querySelectorAll("li");
    for (const it of items) {
      const bold = it.querySelector('span[aria-hidden=\\"true\\"]');
      const s = clean(bold && bold.textContent);
      if (s && schools.indexOf(s) === -1) schools.push(s);
      if (schools.length >= 3) break;
    }
  }
  out.education = schools.join("; ");
  out.docTitle = clean(document.title);
  const ogd = document.querySelector('meta[property="og:description"]');
  out.ogDescription = clean(ogd && ogd.getAttribute("content"));
  return out;
})()`;

/** "(99+) Jane Doe - Founding Engineer | LinkedIn" → "Jane Doe". */
function nameFromTitle(docTitle: string): string {
  const t = docTitle.replace(/^\(\d+\+?\)\s*/, "").replace(/\s*[|│]\s*LinkedIn.*$/i, "");
  const dash = t.indexOf(" - ");
  return (dash > 0 ? t.slice(0, dash) : t).trim();
}
/** The headline portion of the page title, when present. */
function headlineFromTitle(docTitle: string): string {
  const t = docTitle.replace(/^\(\d+\+?\)\s*/, "").replace(/\s*[|│]\s*LinkedIn.*$/i, "");
  const dash = t.indexOf(" - ");
  return dash > 0 ? t.slice(dash + 3).trim() : "";
}
/** "Founding Engineer at Acme · ex-Google" → { title, company }. Empty when there's no " at ". */
function splitRoleCompany(s: string): { title?: string; company?: string } {
  const m = s.split(/\s*·\s*/)[0].match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
  if (!m) return {};
  return { title: m[1].trim() || undefined, company: m[2].trim() || undefined };
}

function buildProfile(profileUrl: string, raw: Record<string, string>): LinkedInProfile {
  const docTitle = raw.docTitle || "";
  const name = raw.name || nameFromTitle(docTitle);
  const headline = raw.headline || headlineFromTitle(docTitle) || raw.ogDescription || "";
  let title = raw.expTitle || "";
  let company = raw.expCompany || "";
  if ((!title || !company) && headline) {
    const sc = splitRoleCompany(headline);
    title = title || sc.title || "";
    company = company || sc.company || "";
  }
  return {
    profileUrl,
    name: name || undefined,
    headline: headline || undefined,
    title: title || undefined,
    company: company || undefined,
    location: raw.location || undefined,
    about: raw.about || undefined,
    education: raw.education || undefined,
  };
}

/**
 * Scrape ONE LinkedIn profile via the user's own logged-in window. Same boundaries as the search: it
 * reads a page the user could open themselves, never logs in / connects / messages. Returns the data,
 * or a typed reason (unavailable when the browser backend is off, needs_login when LinkedIn shows an
 * auth wall, the window is left on the login page for the user to sign in and retry).
 */
export async function scrapeLinkedInProfile(profileUrl: string, opts?: ScrapeOpts): Promise<LinkedInProfileResult> {
  if (!browserEnabled()) {
    return {
      ok: false,
      reason: "unavailable",
      message: "LinkedIn page-scraping needs the browser backend (set JARVIS_BROWSER=playwright).",
    };
  }
  const context = await getContext(opts?.userId);
  if (!context) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Couldn't start the browser. Install Playwright (npm i playwright && npx playwright install chromium).",
    };
  }

  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: PROFILE_TIMEOUT_MS });
  } catch {
    return { ok: false, reason: "error", message: "LinkedIn didn't load in time. Try again in a moment." };
  }

  const needsLogin = (): LinkedInProfileResult => ({
    ok: false,
    reason: "needs_login",
    message: opts?.login?.username
      ? "I tried your saved LinkedIn login but it did not get through (LinkedIn may want a verification step). Finish signing in in the open window, then try again."
      : "Log into LinkedIn in the window Jarvis just opened, then import the profile again.",
  });

  if (isLoginWall(page.url())) {
    if (opts?.login && (await tryAutoLogin(page, opts.login))) {
      try {
        await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: PROFILE_TIMEOUT_MS });
      } catch {
        /* fall through to the wall check below */
      }
    }
    if (isLoginWall(page.url())) {
      try {
        await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded", timeout: PROFILE_TIMEOUT_MS });
        await page.bringToFront();
      } catch {
        /* best effort */
      }
      return needsLogin();
    }
  }

  try {
    await page.waitForSelector("main h1, h1", { timeout: PROFILE_TIMEOUT_MS });
  } catch {
    /* slow render, read whatever is present */
  }
  await page.waitForTimeout(800);

  const raw = (await page.evaluate(PROFILE_READER as unknown as () => Record<string, string>)) as Record<string, string>;
  const profile = buildProfile(profileUrl, raw || {});

  if (!profile.name) {
    if (isLoginWall(page.url())) return needsLogin();
    return {
      ok: false,
      reason: "error",
      message: "Couldn't read this profile. Make sure you're signed into LinkedIn in the open window, then try again.",
    };
  }
  return { ok: true, profile };
}
