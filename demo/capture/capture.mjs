// GOTT demo capture script.
// Records the F1-F8 shot list from DEMO_SPEC.md against the seeded Driftwood Roasters demo account.
// Each shot runs in its own browser context/page so Playwright writes one webm per shot. A visible
// synthetic cursor (ink dot + click ripple) is injected via addInitScript so the recording reads as a
// real hand moving the mouse. Run with `node capture.mjs [shotId]` to record a single shot for testing,
// or with no args to record the full list in order (order matters: goals-after depends on mutations
// made during goals-create and review).

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

const BASE = "http://localhost:3000";
const EMAIL = "demo.driftwood.jarvis@gmail.com";
const PASSWORD = "DriftwoodDemo!2026";
const VIEWPORT = { width: 1920, height: 1080 };

fs.mkdirSync(FOOTAGE_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Cursor injection: a 22px semi-transparent ink dot that follows real mousemove events, plus a click
// ripple on mousedown. Installed via addInitScript so it is present before any page script runs, and
// persists across Next.js client-side (SPA) navigations since those don't reload the document.
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
      pointer-events:none !important; z-index:2147483647; transform:translate(-11px,-11px);
      will-change: transform;
    }
    .__demo_ripple__ {
      position: fixed; top:0; left:0; width:10px;height:10px;border-radius:50%;
      background: rgba(220,38,38,0.12); border:2px solid rgba(220,38,38,0.55);
      pointer-events:none !important; z-index:2147483647; transform:translate(-5px,-5px);
      animation: __demo_ripple_anim__ .6s ease-out forwards;
    }
    @keyframes __demo_ripple_anim__ {
      from { width:10px;height:10px; opacity:1; transform:translate(-5px,-5px) scale(1); }
      to   { width:10px;height:10px; opacity:0; transform:translate(-5px,-5px) scale(5.2); }
    }
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
    window.addEventListener(
      "mousedown",
      (e) => {
        const r = document.createElement("div");
        r.className = "__demo_ripple__";
        r.style.left = e.clientX + "px";
        r.style.top = e.clientY + "px";
        document.documentElement.appendChild(r);
        setTimeout(() => r.remove(), 650);
      },
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

async function smoothMoveTo(page, state, targetX, targetY, { durationMs = 500, segments = 12, stepsPerSeg = 5 } = {}) {
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
  const box = await smoothHover(page, state, locator, opts);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  return box;
}

async function typeInto(page, state, locator, text, opts = {}) {
  await smoothClick(page, state, locator, opts);
  await page.waitForTimeout(150);
  await page.keyboard.type(text, { delay: 55 });
}

async function smoothScroll(page, totalDeltaY, { steps = 16, stepDelay = 65 } = {}) {
  const per = totalDeltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, per);
    await page.waitForTimeout(stepDelay);
  }
}

async function settle(page, ms = 750) {
  await page.waitForTimeout(ms);
}

/** Wait out Today's auto-sync-on-open ("Syncing your accounts...") if it fires, then let the page
 * settle. Fresh Playwright contexts always have empty sessionStorage, so this fires once per shot
 * that visits /today for the first time in its context. */
async function waitTodaySettled(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page
    .waitForFunction(() => !document.body.innerText.includes("Syncing your accounts"), null, { timeout: 20000 })
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
// Context/page setup per shot.
// ---------------------------------------------------------------------------
async function newShotPage(browser, shotId) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    storageState: fs.existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined,
    recordVideo: { dir: FOOTAGE_DIR, size: VIEWPORT },
  });
  await context.addInitScript(installCursor);
  const page = await context.newPage();
  const state = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
  await page.mouse.move(state.x, state.y);
  return { context, page, state };
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
// Login once, save storage state, reuse for every shot context.
// ---------------------------------------------------------------------------
async function login(browser) {
  console.log("Logging in as", EMAIL, "...");
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"][value="signin"]');
  await page.waitForTimeout(1200);
  await page.waitForLoadState("networkidle").catch(() => {});

  // Confirm we actually left /login. Give it one retry since local dev auth has shown a one-off flake.
  if (page.url().includes("/login")) {
    console.warn("  First sign-in attempt did not redirect away from /login, retrying once...");
    await page.click('button[type="submit"][value="signin"]');
    await page.waitForTimeout(1500);
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  if (page.url().includes("/login")) {
    const errText = await page.locator(".text-danger").first().textContent().catch(() => null);
    throw new Error(`Login failed - still on /login. Error text: ${errText ?? "(none found)"}`);
  }
  console.log("  Logged in OK, landed on", page.url());
  await context.storageState({ path: AUTH_STATE_PATH });
  await context.close();
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

async function shotGoalsCreate(browser) {
  const id = "goals-create";
  const { context, page, state } = await newShotPage(browser, id);
  await page.goto(`${BASE}/goals`, { waitUntil: "networkidle" });
  await settle(page, 2000); // pre-roll padding

  const newGoalInput = page.getByPlaceholder("e.g. Grow a respected AI + social-impact consortium");
  await newGoalInput.waitFor({ state: "visible", timeout: 10000 });
  await recordRegionFromLocator(id, "new-goal-input", newGoalInput);
  await typeInto(page, state, newGoalInput, "Win a national roasting award");
  await settle(page, 500);

  const addGoalBtn = page.getByRole("button", { name: "Add", exact: true });
  await smoothClick(page, state, addGoalBtn);
  await page.getByText("Win a national roasting award", { exact: true }).first().waitFor({ timeout: 10000 });
  await settle(page, 800);

  const g1Heading = page.getByRole("heading", { name: "Grow wholesale revenue" });
  await g1Heading.waitFor({ state: "visible", timeout: 10000 });
  const g1Card = g1Heading.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," rounded-xl ")][1]');
  await recordRegionFromLocator(id, "g1-card", g1Card);
  await smoothHover(page, state, g1Heading);
  await settle(page, 900);

  const addSubGoalBtn = g1Card.getByRole("button", { name: "Add sub-goal" });
  await smoothClick(page, state, addSubGoalBtn);
  await settle(page, 500);

  const subGoalInput = g1Card.getByPlaceholder("Sub-goal title");
  await subGoalInput.waitFor({ state: "visible", timeout: 8000 });
  await recordRegionFromLocator(id, "subgoal-input", subGoalInput);
  await typeInto(page, state, subGoalInput, "Enter Good Food Awards");
  await settle(page, 500);

  const subGoalAddBtn = g1Card.getByRole("button", { name: "Add", exact: true });
  await smoothClick(page, state, subGoalAddBtn);
  await page.getByText("Enter Good Food Awards", { exact: true }).first().waitFor({ timeout: 10000 });
  await settle(page, 2000); // post-roll padding

  return finishShot(context, page, id, id);
}

async function shotReview(browser) {
  const id = "review";
  const { context, page, state } = await newShotPage(browser, id);
  await page.goto(`${BASE}/review`, { waitUntil: "networkidle" });
  await settle(page, 2000);

  // Slow scroll through the queue.
  await smoothScroll(page, 500, { steps: 14, stepDelay: 70 });
  await settle(page, 400);
  await smoothScroll(page, -500, { steps: 10, stepDelay: 60 });
  await settle(page, 500);

  const r1Card = page.locator("article", { hasText: "Raise wholesale minimum" }).first();
  await r1Card.waitFor({ state: "visible", timeout: 10000 });
  await r1Card.scrollIntoViewIfNeeded();
  await settle(page, 400);

  const r1Chip = r1Card.locator('button[title="See where this came from"]');
  await recordRegionFromLocator(id, "r1-source-chip", r1Chip);
  await smoothClick(page, state, r1Chip);
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  const dialogPanel = dialog.locator("div.max-w-lg");
  await recordRegionFromLocator(id, "r1-source-modal", dialogPanel);
  await settle(page, 1500);
  await page.locator('button[aria-label="Close"]').click();
  await dialog.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  await settle(page, 500);

  const r1Checkbox = page.getByRole("button", { name: "Select Raise wholesale minimum" });
  await recordRegionFromLocator(id, "r1-checkbox", r1Checkbox);
  await smoothClick(page, state, r1Checkbox);
  await settle(page, 400);

  const r3Checkbox = page.getByRole("button", { name: "Select Check volumes decision" });
  await r3Checkbox.scrollIntoViewIfNeeded();
  await recordRegionFromLocator(id, "r3-checkbox", r3Checkbox);
  await smoothClick(page, state, r3Checkbox);
  await settle(page, 600);

  const bulkBar = page.getByText("2 selected").locator("xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' rounded-lg ')][1]");
  await bulkBar.waitFor({ state: "visible", timeout: 8000 });
  await recordRegionFromLocator(id, "bulk-accept-bar", bulkBar);
  await settle(page, 900);

  const acceptBtn = page.getByRole("button", { name: "Accept 2" });
  await smoothClick(page, state, acceptBtn);
  await page.getByText("2 selected").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  await settle(page, 2000);

  return finishShot(context, page, id, id);
}

async function shotTodayHero(browser) {
  const id = "today-hero";
  const { context, page, state } = await newShotPage(browser, id);
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
  await waitTodaySettled(page);
  await settle(page, 2000); // hold 2s at top

  const a1Card = page.locator("article", { hasText: "Pay Cascadia invoice" }).first();
  await a1Card.waitFor({ state: "visible", timeout: 10000 });
  await recordRegionFromLocator(id, "overdue-card-a1", a1Card);
  await smoothHover(page, state, a1Card);
  await settle(page, 700);

  await smoothScroll(page, 260, { steps: 10, stepDelay: 70 });
  await settle(page, 400);

  const e1Card = page.locator("article", { hasText: "Reply to Sam Okafor" }).first();
  await e1Card.waitFor({ state: "visible", timeout: 10000 });
  await e1Card.scrollIntoViewIfNeeded();
  await recordRegionFromLocator(id, "needs-reply-card-e1", e1Card);
  await smoothHover(page, state, e1Card);
  await settle(page, 2000); // pause on Needs-reply card 2s

  const replyLink = e1Card.getByRole("link", { name: /Reply in Gmail/ });
  await recordRegionFromLocator(id, "reply-in-gmail-link", replyLink);
  await smoothHover(page, state, replyLink); // hover only, never click
  await settle(page, 1300);

  // Continue to Today section: C1 event, A2 task.
  await smoothScroll(page, 420, { steps: 12, stepDelay: 70 });
  await settle(page, 500);

  const a2Card = page.locator("article", { hasText: "Send wholesale pricing to Fern Cafe" }).first();
  await a2Card.waitFor({ state: "visible", timeout: 10000 });
  await a2Card.scrollIntoViewIfNeeded();
  await settle(page, 400);

  const a2GoalChip = a2Card.getByText("Land 10 new cafe accounts", { exact: true });
  await recordRegionFromLocator(id, "goal-chip-a2", a2GoalChip);

  const waitingOnCard = page.locator("article", { hasText: "Nudge Hobart St Bakery" }).first();
  await waitingOnCard.waitFor({ state: "visible", timeout: 10000 });
  await waitingOnCard.scrollIntoViewIfNeeded();
  await recordRegionFromLocator(id, "waiting-on-card-e2", waitingOnCard);
  await smoothHover(page, state, waitingOnCard);
  await settle(page, 1500);

  // Check off A2.
  await a2Card.scrollIntoViewIfNeeded();
  await settle(page, 300);
  const a2Row = a2Card.locator(
    'xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," items-start ")][1]',
  );
  const a2Checkbox = a2Row.locator('button[title="Mark done"]');
  await recordRegionFromLocator(id, "a2-checkbox-before-check", a2Checkbox);
  await smoothClick(page, state, a2Checkbox);
  await settle(page, 1200);

  // Watch it move to Done: scroll down to the Done strip.
  await smoothScroll(page, 900, { steps: 18, stepDelay: 70 });
  await settle(page, 500);
  const doneHeading = page.getByRole("heading", { name: /Done/ });
  await doneHeading.scrollIntoViewIfNeeded().catch(() => {});
  await settle(page, 2000); // hold 2s

  return finishShot(context, page, id, id);
}

async function shotMontage(browser, { id, url, scrollAmount = 500 }) {
  const { context, page, state } = await newShotPage(browser, id);
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await settle(page, 1800);
  await smoothScroll(page, scrollAmount, { steps: 16, stepDelay: 70 });
  await settle(page, 600);
  await smoothScroll(page, Math.round(scrollAmount * 0.4), { steps: 8, stepDelay: 60 });
  await settle(page, 1600);
  void state; // no clicking in montage shots
  return finishShot(context, page, id, id);
}

async function shotMontageTasks(browser) {
  const id = "montage-tasks";
  const { context, page, state } = await newShotPage(browser, id);
  await page.goto(`${BASE}/tasks`, { waitUntil: "networkidle" });
  await settle(page, 1800);

  const firstRow = page.locator("li.group").first();
  await firstRow.waitFor({ state: "visible", timeout: 10000 });
  await recordRegionFromLocator(id, "task-row", firstRow);
  await smoothHover(page, state, firstRow);
  await settle(page, 600);

  const editBtn = firstRow.locator('button[title="Edit"]');
  await recordRegionFromLocator(id, "task-row-edit-icon", editBtn);
  await smoothClick(page, state, editBtn);
  await settle(page, 300);

  const editForm = page.locator("li").filter({ has: page.getByRole("button", { name: "Cancel" }) }).first();
  await editForm.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await recordRegionFromLocator(id, "inline-edit-form", editForm);
  await settle(page, 1400);

  const cancelBtn = editForm.getByRole("button", { name: "Cancel" });
  await smoothClick(page, state, cancelBtn);
  await settle(page, 1600);

  return finishShot(context, page, id, id);
}

async function shotGoalsAfter(browser) {
  const id = "goals-after";
  const { context, page, state } = await newShotPage(browser, id);
  await page.goto(`${BASE}/goals`, { waitUntil: "networkidle" });
  await settle(page, 2000);

  const g1Heading = page.getByRole("heading", { name: "Grow wholesale revenue" });
  await g1Heading.waitFor({ state: "visible", timeout: 10000 });
  const g1Card = g1Heading.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," rounded-xl ")][1]');
  await g1Card.scrollIntoViewIfNeeded();
  await recordRegionFromLocator(id, "g1-card-after", g1Card);
  await smoothHover(page, state, g1Heading);
  await settle(page, 2200);

  await smoothScroll(page, 260, { steps: 10, stepDelay: 70 });
  await settle(page, 2000);

  return finishShot(context, page, id, id);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const SHOT_DEFS = [
  { id: "goals-create", run: shotGoalsCreate, notes: "Types G3 into the new-goal input, adds it, hovers G1, adds sub-goal 'Enter Good Food Awards' under G1." },
  { id: "review", run: shotReview, notes: "Scrolls the review queue, opens R1's source-quote modal, closes it, checks R1+R3, bulk-accepts both." },
  { id: "today-hero", run: shotTodayHero, notes: "Overdue (A1 red + E1 needs-reply red), hovers Reply in Gmail (no click), Today section, hovers waiting-on E2, checks off A2, scrolls to Done." },
  { id: "montage-meetings", run: (b) => shotMontage(b, { id: "montage-meetings", url: "/meetings", scrollAmount: 300 }), notes: "Slow scroll of /meetings." },
  { id: "montage-email", run: (b) => shotMontage(b, { id: "montage-email", url: "/email", scrollAmount: 500 }), notes: "Slow scroll of /email." },
  { id: "montage-calendar", run: (b) => shotMontage(b, { id: "montage-calendar", url: "/calendar", scrollAmount: 400 }), notes: "Slow scroll of /calendar." },
  { id: "montage-tasks", run: shotMontageTasks, notes: "Hovers first task row, opens inline edit (pencil), holds, cancels." },
  { id: "goals-after", run: shotGoalsAfter, notes: "Post-accept /goals: G1 with sub-goals (incl. new 'Enter Good Food Awards') and updated counts." },
];

async function main() {
  const only = process.argv[2];
  const browser = await chromium.launch({ headless: true });
  const manifest = [];
  const failures = [];

  try {
    await login(browser);

    for (const def of SHOT_DEFS) {
      if (only && def.id !== only) continue;
      console.log(`\n=== Shot: ${def.id} ===`);
      const startedAt = Date.now();
      try {
        const videoPath = await def.run(browser);
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

  // Merge with any existing regions.json so recording one shot at a time doesn't wipe earlier shots'
  // region hints (each `node capture.mjs <id>` invocation starts this file fresh in memory).
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

  // Merge with any existing manifest entries (so running a single shot doesn't wipe the others).
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

  if (failures.length) {
    console.error("\nFAILURES:", JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  } else {
    console.log("\nAll requested shots completed.");
  }
}

await main();
