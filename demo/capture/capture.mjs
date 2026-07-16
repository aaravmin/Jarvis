// Otto demo capture script (post-redesign: Notion/Sheets dense UI, renamed GOTT -> Otto).
// Records clean 1920x1080 webm clips of the FINAL Otto UI against the seeded Driftwood Roasters account.
// The left rail shows the "Otto" wordmark (no logo) and has NO Review tab; pending suggestions now live
// in a "Suggested" section at the end of Today (Review was folded in; /review redirects to /today).
// Each shot runs in its own headless-chromium context/page so Playwright writes one webm per shot. A
// visible synthetic cursor (ink dot + click ripple) is injected via addInitScript so the recording reads
// as a real hand. Steady, product-led motion (the edit is ~1 min): slow eased moves + slow scrolls,
// ~2s padding each end. Run `node capture.mjs [shotId]` for one shot, or no args for all in order.
//
// Shots: today, tasks, goals, calendar, email, cmdk. (No standalone `review` shot - that route redirects.)
// Only `tasks` mutates the DB (checks one task done) and it reverts that toggle right after, so a full
// run leaves the seed exactly as it found it and is safe to re-run.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const FOOTAGE_DIR = path.join(REPO_ROOT, "demo/footage");
const AUTH_STATE_PATH = path.join(__dirname, ".auth-state.json");
const REGIONS_PATH = path.join(__dirname, "regions.json");
const MANIFEST_PATH = path.join(FOOTAGE_DIR, "footage-manifest.json");
const CLICKS_PATH = path.join(FOOTAGE_DIR, "clicks.json");

const BASE = "http://localhost:3000";
const EMAIL = "demo.driftwood.jarvis@gmail.com";
const PASSWORD = "DriftwoodDemo!2026";
const VIEWPORT = { width: 1920, height: 1080 };

fs.mkdirSync(FOOTAGE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Cursor injection: a 22px semi-transparent ink dot that follows real mousemove events, with a subtle
// press (the dot dips to 0.8 scale on mousedown). Installed via addInitScript so it is present before
// any page script runs, and persists across Next.js client-side (SPA) navigations since those don't
// reload the document.
//
// NOTE: the click RIPPLE is no longer baked into the footage. The Remotion compositor draws its own
// caramel-tinted ripple + zoom-on-click, synced frame-accurately to `clicks.json` (which this script
// records). Baking a ripple here too would double it up, so the footage only carries the plain cursor.
// ---------------------------------------------------------------------------
function installCursor() {
  if (window.__demoCursorInstalled__) return;
  window.__demoCursorInstalled__ = true;
  const style = document.createElement("style");
  style.textContent = `
    #__demo_cursor__ {
      position: fixed; top:0; left:0; width:22px; height:22px; border-radius:50%;
      background: rgba(51,65,85,0.38); border: 1.5px solid rgba(30,41,59,0.6);
      box-shadow: 0 1px 4px rgba(0,0,0,0.25);
      pointer-events:none !important; z-index:2147483647; transform:translate(-11px,-11px) scale(1);
      will-change: transform; transition: transform .12s ease-out;
    }
    #__demo_cursor__.__press__ { transform: translate(-11px,-11px) scale(0.8); }
  `;
  const attach = () => {
    document.documentElement.appendChild(style);
    const dot = document.createElement("div");
    dot.id = "__demo_cursor__";
    dot.style.left = "960px";
    dot.style.top = "540px";
    document.documentElement.appendChild(dot);
    window.addEventListener(
      "mousemove",
      (e) => {
        dot.style.left = e.clientX + "px";
        dot.style.top = e.clientY + "px";
      },
      { passive: true, capture: true },
    );
    // Subtle press feedback only (no ripple - the compositor draws the caramel ripple from clicks.json).
    window.addEventListener("mousedown", () => dot.classList.add("__press__"), { capture: true });
    window.addEventListener(
      "mouseup",
      () => setTimeout(() => dot.classList.remove("__press__"), 90),
      { capture: true },
    );
  };
  if (document.documentElement) attach();
  else document.addEventListener("DOMContentLoaded", attach);
}

// ---------------------------------------------------------------------------
// Motion helpers: eased, multi-step mouse movement over real wall-clock time (not an instant jump),
// plus click/hover/type/scroll wrappers built on top of it.
// ---------------------------------------------------------------------------
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function smoothMoveTo(page, state, targetX, targetY, { durationMs = 650, segments = 14, stepsPerSeg = 5 } = {}) {
  const fromX = state.x;
  const fromY = state.y;
  const dist = Math.hypot(targetX - fromX, targetY - fromY);
  if (dist < 2) {
    await page.mouse.move(targetX, targetY);
    state.x = targetX;
    state.y = targetY;
    return;
  }
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const eased = easeInOutCubic(t);
    const x = fromX + (targetX - fromX) * eased;
    const y = fromY + (targetY - fromY) * eased;
    await page.mouse.move(x, y, { steps: stepsPerSeg });
    await page.waitForTimeout(durationMs / segments);
  }
  state.x = targetX;
  state.y = targetY;
}

async function boxCenter(locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  return { box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function smoothHover(page, state, locator, opts = {}) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const c = await boxCenter(locator);
  if (!c) throw new Error("smoothHover: locator has no bounding box (not visible?)");
  await smoothMoveTo(page, state, c.x, c.y, opts);
  return c.box;
}

async function smoothClick(page, state, locator, opts = {}) {
  const { rec, label, ...moveOpts } = opts;
  const box = await smoothHover(page, state, locator, moveOpts);
  await page.waitForTimeout(90);
  // Record the click the instant the button goes down - that is the frame the compositor's caramel
  // ripple + zoom-on-click fire on. tSec is measured from the recording start (see newShotPage).
  if (rec && label) recordClick(rec, state, label);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  return box;
}

async function smoothScroll(page, totalDeltaY, { steps = 18, stepDelay = 75 } = {}) {
  const per = totalDeltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, per);
    await page.waitForTimeout(stepDelay);
  }
}

async function settle(page, ms = 800) {
  await page.waitForTimeout(ms);
}

/** Wait out Today's auto-sync-on-open ("Syncing...") if it fires, then let the page settle. Fresh
 * Playwright contexts always have empty sessionStorage, so this can fire once per context that visits
 * /today. */
async function waitTodaySettled(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => !/Syncing\.\.\.|Syncing your accounts/.test(document.body.innerText), null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Region hint logging (for the video agent's callout placement).
// ---------------------------------------------------------------------------
const regions = {};
function recordRegion(shotId, label, box) {
  if (!box) {
    console.warn(`  [region] ${shotId}/${label}: NOT FOUND`);
    return;
  }
  const r = { label, x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
  (regions[shotId] ??= []).push(r);
  console.log(`  [region] ${shotId}/${label}: x=${r.x} y=${r.y} w=${r.w} h=${r.h}`);
}
async function recordRegionFromLocator(shotId, label, locator) {
  const box = await locator.boundingBox().catch(() => null);
  recordRegion(shotId, label, box);
  return box;
}

// ---------------------------------------------------------------------------
// Click recording (for the compositor's synced ripple + zoom-on-click). Each recorded click stores its
// time from the recording start and its page-space (1920x1080) coordinates, keyed by shot id. The video
// side maps tSec -> scene frame (via the clip's trim + playback rate) and (x,y) -> composition space.
// ---------------------------------------------------------------------------
const clicksByShot = {};
function recordClick(rec, state, label) {
  const tSec = (Date.now() - rec.startMs) / 1000;
  rec.clicks.push({
    tSec: Math.round(tSec * 1000) / 1000,
    x: Math.round(state.x),
    y: Math.round(state.y),
    label,
  });
  console.log(`  [click] ${label} @ t=${tSec.toFixed(2)}s  (${Math.round(state.x)}, ${Math.round(state.y)})`);
}

// ---------------------------------------------------------------------------
// Context/page setup per shot.
// ---------------------------------------------------------------------------
async function newShotPage(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    storageState: fs.existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined,
    recordVideo: { dir: FOOTAGE_DIR, size: VIEWPORT },
  });
  await context.addInitScript(installCursor);
  const page = await context.newPage();
  // Recording clock: Playwright starts the webm when the page opens, so t0 ~= now. Click tSecs are
  // measured against this; the video side starts each scene ~1s before its first click, so small
  // (<0.1s) start-of-encode offsets stay well inside the ripple/zoom window.
  const rec = { startMs: Date.now(), clicks: [] };
  const state = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
  await page.mouse.move(state.x, state.y);
  return { context, page, state, rec };
}

async function finishShot(context, page, shotId, fileBaseName) {
  const startedClose = Date.now();
  await context.close();
  const tmpPath = await page.video().path();
  const finalPath = path.join(FOOTAGE_DIR, `${fileBaseName}.webm`);
  fs.renameSync(tmpPath, finalPath);
  console.log(`  [video] ${shotId} -> ${finalPath} (finalized in ${Date.now() - startedClose}ms)`);
  return finalPath;
}

// ---------------------------------------------------------------------------
// Login once, save storage state, reuse for every shot context. The redesigned submit button is
// `disabled` while the server action is pending and detaches on redirect, so a direct .click races.
// Submit via Enter and wait for the URL to leave /login.
// ---------------------------------------------------------------------------
async function login(browser) {
  console.log("Logging in as", EMAIL, "...");
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(700); // let React hydrate
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  const leftLogin = () => page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 20000 });
  await Promise.all([leftLogin().catch(() => {}), page.press("#password", "Enter")]);
  await page.waitForLoadState("networkidle").catch(() => {});
  if (page.url().includes("/login")) {
    console.warn("  First sign-in did not redirect, retrying once...");
    await Promise.all([leftLogin().catch(() => {}), page.press("#password", "Enter")]);
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  if (page.url().includes("/login")) {
    const errText = await page.locator(".text-destructive").first().textContent().catch(() => null);
    throw new Error(`Login failed - still on /login. Error text: ${errText ?? "(none found)"}`);
  }
  console.log("  Logged in OK, landed on", page.url());
  await context.storageState({ path: AUTH_STATE_PATH });
  await context.close();
}

/** Revert a task's done-state via the UI (non-recorded), so `tasks` leaves the seed pristine. */
async function revertTaskToggle(browser, title) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, storageState: AUTH_STATE_PATH });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded" });
    const row = page.locator("tr", { hasText: title }).first();
    await row.waitFor({ state: "visible", timeout: 20000 });
    const btn = row.locator("td:first-child button");
    const t = await btn.getAttribute("title").catch(() => null);
    if (t === "Mark not done") {
      await btn.click();
      await page.waitForTimeout(1200); // let PATCH + refresh land
      console.log(`  [revert] "${title}" toggled back to not-done`);
    } else {
      console.log(`  [revert] "${title}" already not-done (title="${t}") - nothing to do`);
    }
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** today: slow scroll through Overdue (red invoice + red Needs-reply) -> Today -> Next 7 days -> Later
 * -> Done -> Suggested. Pause on a Needs-reply card, hover "Reply in Gmail" WITHOUT clicking away, then
 * carry on to the "Suggested" section at the very end and hover an item's Accept (no click - no DB write). */
async function shotToday(browser) {
  const id = "today";
  const { context, page, state } = await newShotPage(browser);
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await waitTodaySettled(page);
  await settle(page, 2000); // pre-roll, hold at top of Overdue

  const invoiceRow = page.locator("li", { hasText: "Pay Cascadia invoice #2841" }).first();
  await invoiceRow.waitFor({ state: "visible", timeout: 10000 });
  await recordRegionFromLocator(id, "overdue-invoice-card", invoiceRow);
  const goalChip = invoiceRow.getByText("Keep roastery operations tight", { exact: true });
  await recordRegionFromLocator(id, "goal-chip", goalChip);
  await smoothHover(page, state, invoiceRow);
  await settle(page, 800);

  // Bring the Sam Okafor Needs-reply card into clear view and pause on it.
  await smoothScroll(page, 150, { steps: 8, stepDelay: 70 });
  await settle(page, 350);
  const samRow = page.locator("li", { hasText: "Reply to Sam Okafor" }).first();
  await samRow.waitFor({ state: "visible", timeout: 10000 });
  await samRow.scrollIntoViewIfNeeded();
  await recordRegionFromLocator(id, "needs-reply-card", samRow);
  await smoothHover(page, state, samRow);
  await settle(page, 1800); // pause on the Needs-reply card

  const replyLink = samRow.getByRole("link", { name: /Reply in Gmail/ });
  await recordRegionFromLocator(id, "reply-in-gmail-link", replyLink);
  await smoothHover(page, state, replyLink); // hover only, never click
  await settle(page, 1400);

  // Slow scroll down through the buckets to Done.
  await smoothScroll(page, 300, { steps: 14, stepDelay: 75 });
  await settle(page, 650); // Today
  await smoothScroll(page, 320, { steps: 14, stepDelay: 75 });
  await settle(page, 650); // Next 7 days
  await smoothScroll(page, 340, { steps: 14, stepDelay: 75 });
  await settle(page, 550); // Later
  const doneHeading = page.getByRole("heading", { name: "Done", exact: true });
  await doneHeading.scrollIntoViewIfNeeded().catch(() => {});
  await smoothScroll(page, 260, { steps: 12, stepDelay: 75 });
  await settle(page, 900); // brief hold on the green Done strip

  // Carry on to the "Suggested" section at the very end of the feed (Review, folded into Today). It is
  // the L0 approval gate: each item has its own Dismiss/Accept. Hover an Accept WITHOUT clicking.
  const suggestedHeading = page.getByRole("heading", { name: "Suggested", exact: true });
  await smoothScroll(page, 360, { steps: 16, stepDelay: 72 });
  await settle(page, 400);
  if (await suggestedHeading.count()) {
    await suggestedHeading.scrollIntoViewIfNeeded().catch(() => {});
    await recordRegionFromLocator(id, "suggested-heading", suggestedHeading);
    await smoothScroll(page, 150, { steps: 9, stepDelay: 72 }); // nudge so the Accept buttons sit clear of the fold
    await settle(page, 500);
    const acceptBtn = page.getByRole("button", { name: "Accept" }).first();
    await acceptBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    await recordRegionFromLocator(id, "suggested-accept", acceptBtn);
    await smoothHover(page, state, acceptBtn).catch(() => {}); // hover only, never click (no DB write)
    await settle(page, 2400); // post-roll, hold on the Suggested section
  } else {
    console.warn("  [today] Suggested section not found - holding at feed bottom instead");
    await settle(page, 2000);
  }

  return finishShot(context, page, id, id);
}

/** tasks: the new Tasks TABLE - slow pan, then check a task's checkbox (it strikes through + goes done).
 * Toggles "Book Probat quarterly service"; the caller reverts it afterward to keep the seed pristine. */
async function shotTasks(browser) {
  const id = "tasks";
  const TARGET = "Book Probat quarterly service";
  const { context, page, state } = await newShotPage(browser);
  // domcontentloaded (not networkidle): the dev server's HMR socket keeps the connection non-idle, so
  // networkidle can hang. We gate on the table actually painting instead.
  await page.goto(`${BASE}/tasks`, { waitUntil: "domcontentloaded" });
  await page.locator("tr", { hasText: "Pay Cascadia invoice #2841" }).first().waitFor({ state: "visible", timeout: 20000 });
  await settle(page, 2000);

  // Slow pan down the sheet and back so the table's density reads.
  await smoothScroll(page, 220, { steps: 14, stepDelay: 75 });
  await settle(page, 500);
  await smoothScroll(page, -120, { steps: 10, stepDelay: 70 });
  await settle(page, 500);

  const row = page.locator("tr", { hasText: TARGET }).first();
  await row.waitFor({ state: "visible", timeout: 10000 });
  await row.scrollIntoViewIfNeeded();
  await recordRegionFromLocator(id, "task-row", row);
  const checkbox = row.locator('td:first-child button[title="Mark done"]');
  await recordRegionFromLocator(id, "task-checkbox-toggle", checkbox);
  await smoothHover(page, state, row);
  await settle(page, 500);

  // Check it off: PATCH + router.refresh() -> the row re-renders struck-through + green check, still in place.
  await smoothClick(page, state, checkbox);
  await page
    .locator("tr", { hasText: TARGET })
    .locator("p.line-through")
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  await settle(page, 2400); // hold on the struck-through row

  const outPath = await finishShot(context, page, id, id);
  return outPath;
}

/** goals: Goals list with its weekly goals (formerly "sub-goals"), reveal the "Add weekly goal" form so
 * the new wording shows on camera, then drill into a weekly goal's detail with its Linked items. */
async function shotGoals(browser) {
  const id = "goals";
  const { context, page, state } = await newShotPage(browser);
  await page.goto(`${BASE}/goals`, { waitUntil: "networkidle" });
  await settle(page, 2000);

  // "Grow wholesale revenue" is the top-level goal that carries the 3 weekly goals; it sits at the bottom.
  const parentRow = page.getByText("Grow wholesale revenue", { exact: true }).locator("xpath=ancestor::div[contains(@class,'px-3')][1]");
  await parentRow.first().scrollIntoViewIfNeeded().catch(() => {});
  await recordRegionFromLocator(id, "goal-row-with-weekly-goals", parentRow.first());
  await smoothScroll(page, 220, { steps: 14, stepDelay: 75 });
  await settle(page, 700);

  // Reveal the "Add weekly goal" inline form so the renamed wording ("Weekly goal title") is on camera.
  // Read-only: we open the input and hold, but never type or submit, so the seed is untouched.
  const addWeekly = parentRow.first().locator('button[title="Add weekly goal"]').first();
  if (await addWeekly.count()) {
    await recordRegionFromLocator(id, "add-weekly-goal-button", addWeekly);
    await smoothClick(page, state, addWeekly);
    const weeklyInput = page.getByPlaceholder("Weekly goal title");
    await weeklyInput.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
    await recordRegionFromLocator(id, "weekly-goal-input", weeklyInput);
    await settle(page, 1700); // hold so "Weekly goal title" reads
  } else {
    console.warn("  [goals] 'Add weekly goal' button not found - skipping the wording reveal");
  }

  const subGoal = page.locator("li", { hasText: "Land 10 new cafe accounts" }).first();
  await subGoal.waitFor({ state: "visible", timeout: 10000 });
  await subGoal.scrollIntoViewIfNeeded();
  await recordRegionFromLocator(id, "weekly-goal-row", subGoal);
  await smoothHover(page, state, subGoal);
  await settle(page, 800);

  // Drill into the weekly goal's detail (Linked (2)).
  const subLink = subGoal.getByRole("link").first();
  await smoothClick(page, state, subLink);
  await page.getByRole("heading", { name: /^Linked/ }).waitFor({ state: "visible", timeout: 10000 });
  await settle(page, 800);
  const linkedHeading = page.getByRole("heading", { name: /^Linked/ });
  await recordRegionFromLocator(id, "linked-section", linkedHeading);
  const firstLinked = page.locator("section", { hasText: "Linked" }).locator("div.divide-y > div").first();
  await recordRegionFromLocator(id, "linked-item", firstLinked);
  await smoothHover(page, state, firstLinked).catch(() => {});
  await settle(page, 2000); // post-roll, hold on the Linked items

  return finishShot(context, page, id, id);
}

/** A short, slow scroll of a dense sheet list (calendar / email). */
async function shotScrollList(browser, { id, url, scrollAmount }) {
  const { context, page, state } = await newShotPage(browser);
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await settle(page, 1900); // pre-roll
  void state;
  await smoothScroll(page, scrollAmount, { steps: 18, stepDelay: 80 });
  await settle(page, 700);
  await smoothScroll(page, Math.round(-scrollAmount * 0.35), { steps: 10, stepDelay: 70 });
  await settle(page, 1800); // post-roll
  return finishShot(context, page, id, id);
}

/** cmdk: press Cmd-K, the command palette opens, arrow to a nav item. */
async function shotCmdk(browser) {
  const id = "cmdk";
  const { context, page, state } = await newShotPage(browser);
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await waitTodaySettled(page);
  void state;
  await settle(page, 2000); // pre-roll on the Today surface

  await page.keyboard.press("Meta+k");
  const palette = page.locator('input[placeholder="Go to..."]');
  await palette.waitFor({ state: "visible", timeout: 8000 });
  const dialog = page.locator('[role="dialog"]').first();
  await recordRegionFromLocator(id, "command-palette", dialog);
  await settle(page, 1300); // palette open, first item ("Today") highlighted

  // Arrow down once to "Goals" (now the 2nd nav item - Review is gone), pausing so the highlight reads.
  await page.keyboard.press("ArrowDown");
  await settle(page, 900);
  const selected = page.locator('[data-slot="command-item"][data-selected="true"]');
  await recordRegionFromLocator(id, "selected-nav-item", selected);
  await settle(page, 2000); // post-roll, hold on the highlighted "Goals" nav item

  return finishShot(context, page, id, id);
}

/** Warm the /tasks and /goals routes in a throwaway (non-recorded) context so the hero shot's real
 * client-side navigations paint instantly instead of hitting a dev-server route compile mid-take. */
async function warmRoutes(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, storageState: AUTH_STATE_PATH });
  const page = await context.newPage();
  try {
    for (const [url, probe] of [
      ["/tasks", "Pay Cascadia invoice #2841"],
      ["/goals", "Grow wholesale revenue"],
      ["/today", "Overdue"],
    ]) {
      await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.getByText(probe, { exact: false }).first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    }
    console.log("  [warm] /tasks, /goals, /today compiled");
  } finally {
    await context.close();
  }
}

/** hero: ONE continuous take with REAL in-app navigation, so the page switches are real footage the
 * compositor can sync its zoom + page-switch flourish to. Flow: land on Today (red Overdue cards) ->
 * click "Tasks" in the left rail (real page switch) -> check off "Book Probat quarterly service" (it
 * strikes through green in place) -> click "Goals" in the left rail (real page switch) -> land on
 * "Grow wholesale revenue" with its weekly goals nested. Records 3 clicks (nav:tasks, check:book-probat,
 * nav:goals). The check-off is reverted afterward (via revertTaskToggle) so the seed stays pristine. */
async function shotHero(browser) {
  const id = "hero";
  const TARGET = "Book Probat quarterly service";
  const { context, page, state, rec } = await newShotPage(browser);

  // --- Today (establish: the red Overdue attention cards) ---
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" }).catch(() => {});
  await waitTodaySettled(page);
  const invoiceRow = page.locator("li", { hasText: "Pay Cascadia invoice #2841" }).first();
  await invoiceRow.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  await settle(page, 1300); // brief establish on Today before we act

  // --- Real page switch #1: click "Tasks" in the left rail ---
  const tasksNav = page.locator('aside nav a[href="/tasks"]').first();
  await tasksNav.waitFor({ state: "visible", timeout: 10000 });
  await recordRegionFromLocator(id, "nav-tasks", tasksNav);
  await smoothClick(page, state, tasksNav, { rec, label: "nav:tasks", durationMs: 620 });
  await page.locator("tr", { hasText: TARGET }).first().waitFor({ state: "visible", timeout: 20000 });
  await settle(page, 700); // land on the Tasks table

  // --- Check off a task: it strikes through + goes done (green) in place ---
  const row = page.locator("tr", { hasText: TARGET }).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  const checkbox = row.locator('td:first-child button[title="Mark done"]');
  await recordRegionFromLocator(id, "task-checkbox", checkbox);
  await smoothHover(page, state, row, { durationMs: 420 });
  await settle(page, 350);
  await smoothClick(page, state, checkbox, { rec, label: "check:book-probat", durationMs: 380 });
  await page
    .locator("tr", { hasText: TARGET })
    .locator("p.line-through")
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {});
  // Step the cursor off the ROW entirely (into the empty gutter beside the table) so the row un-hovers
  // and renders its clean green check - otherwise the hovered checkbox stays muted and the cursor dot
  // hides it. This also lets the compositor's caramel ripple read cleanly from the click point.
  await settle(page, 300);
  await smoothMoveTo(page, state, 360, state.y, { durationMs: 360 });
  await settle(page, 1600); // hold on the struck-through row with its green check revealed

  // --- Real page switch #2: click "Goals" in the left rail ---
  const goalsNav = page.locator('aside nav a[href="/goals"]').first();
  await goalsNav.waitFor({ state: "visible", timeout: 10000 });
  await recordRegionFromLocator(id, "nav-goals", goalsNav);
  await smoothClick(page, state, goalsNav, { rec, label: "nav:goals", durationMs: 620 });

  // --- Land on Goals: "Grow wholesale revenue" with its weekly goals nested under it ---
  const parent = page.getByText("Grow wholesale revenue", { exact: true }).first();
  await parent.waitFor({ state: "visible", timeout: 15000 });
  await settle(page, 500);
  await parent.scrollIntoViewIfNeeded().catch(() => {});
  await smoothScroll(page, 200, { steps: 12, stepDelay: 72 }); // reveal the nested weekly goals
  await settle(page, 300);
  const weekly = page.locator("li", { hasText: "Land 10 new cafe accounts" }).first();
  await smoothHover(page, state, weekly, { durationMs: 520 }).catch(() => {});
  await settle(page, 2200); // post-roll, hold on the nested weekly goals

  clicksByShot[id] = rec.clicks;
  return finishShot(context, page, id, id);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const SHOT_DEFS = [
  { id: "hero", run: shotHero, notes: "HERO continuous take with REAL in-app nav (for synced zoom + page-switch motion). Lands on Today (red Overdue cards), clicks 'Tasks' in the left rail (real page switch), checks off 'Book Probat quarterly service' (strikes through green in place), clicks 'Goals' in the left rail (real page switch), lands on 'Grow wholesale revenue' with weekly goals nested. Records clicks (nav:tasks, check:book-probat, nav:goals) to clicks.json. The check-off is reverted afterward so the seed stays pristine." },
  { id: "today", run: shotToday, notes: "Today feed, dense rows. Holds at top of Overdue (red invoice 'Pay Cascadia invoice #2841' + two red Needs-reply cards). Pauses on the 'Reply to Sam Okafor' Needs-reply card, hovers its 'Reply in Gmail' link WITHOUT clicking (page never leaves /today), slow-scrolls Today -> Next 7 days -> Later -> Done, then carries on to the 'Suggested' section at the end (Review, folded into Today) and hovers an item's Accept WITHOUT clicking. 2s pre/post padding." },
  { id: "tasks", run: shotTasks, notes: "The new Tasks TABLE. Slow pan down and back, then checks off 'Book Probat quarterly service' - it strikes through + turns done (green check) in place. The toggle is reverted right after so the seed stays pristine. 2s pre/post padding." },
  { id: "goals", run: shotGoals, notes: "Goals list: 'Grow wholesale revenue' with its 3 weekly goals visible, reveals the 'Add weekly goal' inline form ('Weekly goal title') so the renamed wording reads, then drills into the 'Land 10 new cafe accounts' weekly-goal detail showing 'Linked (2)' items + back-to-Goals link. 2s pre/post padding." },
  { id: "calendar", run: (b) => shotScrollList(b, { id: "calendar", url: "/calendar", scrollAmount: 320 }), notes: "Dense calendar sheet, slow scroll through the 4 events (Cupping with Fern Cafe, Production planning sync, Cascadia payment due, Farmers market - Lippitt Park)." },
  { id: "email", run: (b) => shotScrollList(b, { id: "email", url: "/email", scrollAmount: 520 }), notes: "Dense email sheet, slow scroll through the 6 sender groups (Driftwood Roasters, Fern Cafe, Hobart St Bakery, Providence Packaging Co, Providence Farmers Market Collective, Cascadia Green Coffee Importers)." },
  { id: "cmdk", run: shotCmdk, notes: "Over the Today surface, presses Cmd-K; the command palette opens (input 'Go to...', 8 nav items). Arrows down once to highlight the 'Goals' nav item (now 2nd, Review is gone) and holds. 2s pre/post padding." },
];

async function main() {
  const only = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  const manifest = [];
  const failures = [];

  try {
    await login(browser);
    if (!only || only === "hero") await warmRoutes(browser);

    for (const def of SHOT_DEFS) {
      if (only && def.id !== only) continue;
      console.log(`\n=== Shot: ${def.id} ===`);
      const startedAt = Date.now();
      try {
        const videoPath = await def.run(browser);
        if (def.id === "tasks" || def.id === "hero") await revertTaskToggle(browser, "Book Probat quarterly service");
        const elapsedSec = (Date.now() - startedAt) / 1000;
        manifest.push({ id: def.id, file: path.basename(videoPath), durationSec: null, wallClockSec: Math.round(elapsedSec * 10) / 10, notes: def.notes });
        console.log(`  OK (${elapsedSec.toFixed(1)}s wall clock)`);
      } catch (err) {
        console.error(`  FAILED: ${def.id}:`, err && err.message ? err.message : err);
        failures.push({ id: def.id, error: err && err.message ? err.message : String(err) });
      }
    }
  } finally {
    await browser.close();
  }

  // Merge region hints with any existing file so single-shot runs don't wipe other shots' entries.
  let existingRegions = {};
  if (fs.existsSync(REGIONS_PATH)) {
    try {
      existingRegions = JSON.parse(fs.readFileSync(REGIONS_PATH, "utf8"));
    } catch {
      existingRegions = {};
    }
  }
  const mergedRegions = { ...existingRegions, ...regions };
  fs.writeFileSync(REGIONS_PATH, JSON.stringify(mergedRegions, null, 2));
  console.log(`\nWrote region hints to ${REGIONS_PATH}`);

  // Merge manifest entries (single-shot runs keep the others). Ordered by SHOT_DEFS.
  let existing = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    } catch {
      existing = [];
    }
  }
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const m of manifest) byId.set(m.id, m);
  const merged = SHOT_DEFS.map((d) => byId.get(d.id)).filter(Boolean);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(merged, null, 2));
  console.log(`Wrote manifest to ${MANIFEST_PATH}`);

  // Merge click tracks (single-shot runs keep other shots' clicks). Used by the compositor to sync the
  // caramel ripple + zoom-on-click + page-switch flourish to the real clicks in the footage.
  let existingClicks = {};
  if (fs.existsSync(CLICKS_PATH)) {
    try {
      existingClicks = JSON.parse(fs.readFileSync(CLICKS_PATH, "utf8"));
    } catch {
      existingClicks = {};
    }
  }
  const mergedClicks = { ...existingClicks, ...clicksByShot };
  fs.writeFileSync(CLICKS_PATH, JSON.stringify(mergedClicks, null, 2));
  console.log(`Wrote click tracks to ${CLICKS_PATH}`);

  if (failures.length) {
    console.error("\nFAILURES:", JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  } else {
    console.log("\nAll requested shots completed.");
  }
}

await main();
