import "server-only";

/**
 * The Application agent's "hands/eyes": a thin, dependency-decoupled wrapper around Playwright.
 *
 * Why the `new Function("m", "return import(m)")` trick instead of a plain `import "playwright"`?
 * It keeps the bundler from statically resolving the package, so the app builds and runs even when
 * Playwright isn't installed (the scraper then uses its static-HTML fallback). When `playwright` IS
 * installed (`npm i playwright && npx playwright install chromium`) and `JARVIS_BROWSER=playwright`,
 * these helpers light up the real browser.
 *
 * Scope (hard rule #5): this module opens pages, reads forms, and FILLS fields. It never clicks a
 * Submit/Apply button — submission is always the user's explicit action in the window we leave open.
 *
 * Local-only by design: launching a visible browser requires a display, so this is meant to run on the
 * user's machine (the local dev server). On a headless server it degrades gracefully (returns null /
 * reports it's unavailable) rather than throwing.
 */

// ── Minimal structural types for the slice of Playwright we use (avoids a hard dependency on its types).
export type PwLocator = {
  count: () => Promise<number>;
  first: () => PwLocator;
  fill: (value: string, opts?: unknown) => Promise<void>;
  click: (opts?: unknown) => Promise<void>;
  check: (opts?: unknown) => Promise<void>;
  selectOption: (values: unknown, opts?: unknown) => Promise<string[]>;
  setInputFiles: (files: unknown, opts?: unknown) => Promise<void>;
  scrollIntoViewIfNeeded: (opts?: unknown) => Promise<void>;
  inputValue: (opts?: unknown) => Promise<string>;
  isVisible: (opts?: unknown) => Promise<boolean>;
};

export type PwPage = {
  goto: (url: string, opts?: unknown) => Promise<unknown>;
  content: () => Promise<string>;
  title: () => Promise<string>;
  locator: (selector: string) => PwLocator;
  getByLabel: (text: string, opts?: unknown) => PwLocator;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate: <T = unknown>(fn: (...a: any[]) => T, arg?: unknown) => Promise<T>;
  bringToFront: () => Promise<void>;
  waitForLoadState: (state?: string, opts?: unknown) => Promise<void>;
  waitForTimeout: (ms: number) => Promise<void>;
};

export type PwContext = {
  newPage: () => Promise<PwPage>;
  close: () => Promise<void>;
};

export type PwBrowser = {
  newContext: (opts?: unknown) => Promise<PwContext>;
  newPage: () => Promise<PwPage>;
  close: () => Promise<void>;
  isConnected: () => boolean;
};

type Chromium = {
  launch: (opts?: { headless?: boolean; args?: string[]; timeout?: number }) => Promise<PwBrowser>;
};

/** True when the operator has opted into the browser backend. */
export function browserEnabled(): boolean {
  return process.env.JARVIS_BROWSER === "playwright";
}

/** Dynamically load Playwright's chromium without the bundler resolving the package. Null if absent. */
export async function loadChromium(): Promise<Chromium | null> {
  if (!browserEnabled()) return null;
  try {
    const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<{
      chromium?: Chromium;
    }>;
    const pw = await dynamicImport("playwright");
    return pw.chromium ?? null;
  } catch {
    return null;
  }
}

const LAUNCH_ARGS = ["--no-default-browser-check", "--no-first-run", "--disable-blink-features=AutomationControlled"];
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Launch a browser. For SCRAPING (read-only) we run headless. For AUTOFILL we run headed so the user
 * sees the filled form and submits it themselves. Returns null when Playwright is unavailable.
 */
export async function launchBrowser(opts: { headless: boolean }): Promise<PwBrowser | null> {
  const chromium = await loadChromium();
  if (!chromium) return null;
  try {
    return await chromium.launch({ headless: opts.headless, args: LAUNCH_ARGS, timeout: 30_000 });
  } catch {
    return null;
  }
}

/** A fresh page with a realistic UA, for either backend. */
export async function newPage(browser: PwBrowser): Promise<PwPage> {
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

// ── Headed autofill session registry ────────────────────────────────────────────────────────────
// An autofill leaves a real browser window OPEN for the user to review and submit. We keep its handle
// so a re-fill of the same run closes the prior window first (no pile-up) and a later action can close
// it. Kept on globalThis so it survives Next's dev HMR module reloads (single process in dev).
export type AutofillSession = { browser: PwBrowser; page: PwPage; createdAt: number };

type Registry = Map<string, AutofillSession>;
const g = globalThis as unknown as { __jarvisAutofillSessions?: Registry };
const sessions: Registry = (g.__jarvisAutofillSessions ??= new Map());

export async function closeSession(runId: string): Promise<void> {
  const s = sessions.get(runId);
  sessions.delete(runId);
  if (!s) return;
  try {
    await s.browser.close();
  } catch {
    /* already gone */
  }
}

export async function registerSession(runId: string, session: AutofillSession): Promise<void> {
  await closeSession(runId); // close any window left open from a previous fill of this run
  sessions.set(runId, session);
}

export function hasSession(runId: string): boolean {
  const s = sessions.get(runId);
  return Boolean(s && s.browser.isConnected());
}
