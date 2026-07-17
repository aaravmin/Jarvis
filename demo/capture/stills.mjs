// Focus-scene STILLS generator for the motion cut (Story v2, clean-dashboard recapture).
//
// The four near-static FOCUS scenes (SC3 goals, SC4 connect, SC5 day, SC6a suggested) are driven by
// pre-extracted stills, not slow-mo video (crisp, and immune to the OffthreadVideo blank-tail). This
// captures them DIRECTLY as full 1920x1080 viewport screenshots of the NEW contained Notion-style
// dashboard, at controlled scroll positions, with the same real arrow cursor + dev-overlay hide the
// video's footage uses. It also logs the EXACT page-space bounding box of every element the video points
// at, so the composition's focus targets + pointer rings line up to the pixel.
//
// Output: demo/video/public/stills/{goals,today-scroll0,today-suggested}.png  + boxes -> stills-boxes.json
// Run:    node stills.mjs   (dev server must be on :3000; reuses .auth-state.json, logs in if missing)

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const AUTH = path.join(__dirname, ".auth-state.json");
const STILLS_DIR = path.join(REPO_ROOT, "demo/video/public/stills");
const BOXES_PATH = path.join(__dirname, "stills-boxes.json");
const BASE = "http://localhost:3000";
const EMAIL = "demo.driftwood.jarvis@gmail.com";
const PASSWORD = "DriftwoodDemo!2026";
const VIEWPORT = { width: 1920, height: 1080 };

fs.mkdirSync(STILLS_DIR, { recursive: true });

// The exact real-arrow cursor + dev-overlay hide the capture uses (kept in sync with capture.mjs).
function installCursor() {
  if (window.__demoCursorInstalled__) return;
  window.__demoCursorInstalled__ = true;
  const base = "translate(-2px,-2px)";
  const attach = () => {
    const devHide = document.createElement("style");
    devHide.textContent =
      "nextjs-portal,[data-nextjs-toast],[data-next-badge-root],[data-next-badge]," +
      "#__next-build-watcher,[data-nextjs-dialog-overlay],[data-nextjs-dev-tools-button]" +
      "{display:none !important;visibility:hidden !important;opacity:0 !important;}";
    document.documentElement.appendChild(devHide);
    const wrap = document.createElement("div");
    wrap.id = "__demo_cursor__";
    wrap.style.cssText =
      "position:fixed;top:0;left:0;width:22px;height:30px;pointer-events:none !important;" +
      "z-index:2147483647;transform:" + base + ";transform-origin:2px 2px;" +
      "will-change:left,top,transform;transition:transform .09s ease-out;" +
      "filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.32));";
    wrap.innerHTML =
      '<svg width="22" height="30" viewBox="0 0 22 30" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2,2 L2,22.8 L7.46,17.86 L10.45,24.75 L12.66,23.84 L9.8,16.95 L16.69,16.95 Z" ' +
      'fill="#1b1b1b" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      "</svg>";
    wrap.style.left = "960px";
    wrap.style.top = "540px";
    document.documentElement.appendChild(wrap);
    window.addEventListener("mousemove", (e) => {
      wrap.style.left = e.clientX + "px";
      wrap.style.top = e.clientY + "px";
    }, { passive: true, capture: true });
  };
  if (document.documentElement) attach();
  else document.addEventListener("DOMContentLoaded", attach);
}

async function login(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#email").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(700);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  const leftLogin = () => page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 20000 });
  await Promise.all([leftLogin().catch(() => {}), page.press("#password", "Enter")]);
  await page.waitForLoadState("networkidle").catch(() => {});
  await context.storageState({ path: AUTH });
  await context.close();
}

const boxes = {};
async function logBox(page, key, sub, locator) {
  const b = await locator.first().boundingBox().catch(() => null);
  (boxes[key] ??= {});
  if (b) {
    boxes[key][sub] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), cx: Math.round(b.x + b.width / 2), cy: Math.round(b.y + b.height / 2) };
    console.log(`  ${key}.${sub}: center=(${boxes[key][sub].cx},${boxes[key][sub].cy}) box=[${boxes[key][sub].x},${boxes[key][sub].y},${boxes[key][sub].w},${boxes[key][sub].h}]`);
  } else {
    console.log(`  ${key}.${sub}: NOT FOUND`);
  }
}

/** Move the injected cursor to (x,y) and let it settle (near, not on, the target - the ring points). */
async function cursorTo(page, x, y) {
  await page.mouse.move(x, y, { steps: 12 });
  await page.waitForTimeout(150);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await login(browser);
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, storageState: AUTH });
    await context.addInitScript(installCursor);
    const page = await context.newPage();

    // ---------- goals.png (SC3) ----------
    console.log("\n=== goals.png ===");
    await page.goto(`${BASE}/goals`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await logBox(page, "goals", "grow", page.getByText("Grow wholesale revenue", { exact: true }));
    await logBox(page, "goals", "growRow", page.getByText("Grow wholesale revenue", { exact: true }).locator("xpath=ancestor::div[contains(@class,'px-3')][1]"));
    await logBox(page, "goals", "landWeekly", page.getByText("Land 10 new cafe accounts", { exact: true }));
    await logBox(page, "goals", "launchWeekly", page.getByText("Launch a coffee subscription", { exact: true }));
    await logBox(page, "goals", "keep", page.getByText("Keep roastery operations tight", { exact: true }));
    await cursorTo(page, 980, 300);
    await page.screenshot({ path: path.join(STILLS_DIR, "goals.png") });

    // ---------- today-scroll0.png (SC4 + SC5) ----------
    console.log("\n=== today-scroll0.png ===");
    await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !/Syncing/.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    const fern = page.locator("li", { hasText: "Send wholesale pricing to Fern Cafe" });
    const sam = page.locator("li", { hasText: "Reply to Sam Okafor" });
    await logBox(page, "today", "invoiceRow", page.locator("li", { hasText: "Pay Cascadia invoice #2841" }));
    await logBox(page, "today", "fernRow", fern);
    await logBox(page, "today", "fernGoalChip", fern.getByText("Land 10 new cafe accounts", { exact: true }));
    await logBox(page, "today", "samRow", sam);
    await logBox(page, "today", "samNeedsReply", sam.getByText("Needs reply", { exact: true }));
    await logBox(page, "today", "samWaiting", sam.getByText(/Waiting on you/));
    await cursorTo(page, 812, 262); // just below the Fern goal chip (ambient; the ring points)
    await page.screenshot({ path: path.join(STILLS_DIR, "today-scroll0.png") });

    // ---------- today-suggested.png (SC6a) ----------
    console.log("\n=== today-suggested.png ===");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);
    await logBox(page, "suggested", "heading", page.getByRole("heading", { name: "Suggested", exact: true }));
    const firstSug = page.locator("li", { hasText: "Cupping with Fern Cafe" }).last();
    await logBox(page, "suggested", "firstAccept", page.getByRole("button", { name: "Accept" }).first());
    await logBox(page, "suggested", "checkVolumesRow", page.locator("li", { hasText: "Check volumes decision with Priya" }));
    await logBox(page, "suggested", "checkVolumesChip", page.locator("li", { hasText: "Check volumes decision with Priya" }).getByText("Land 10 new cafe accounts", { exact: true }));
    await logBox(page, "suggested", "checkVolumesAccept", page.locator("li", { hasText: "Check volumes decision with Priya" }).getByRole("button", { name: "Accept" }));
    await logBox(page, "suggested", "raiseMinRow", page.locator("li", { hasText: "Raise wholesale minimum" }));
    await logBox(page, "suggested", "raiseMinChip", page.locator("li", { hasText: "Raise wholesale minimum" }).getByText("Grow wholesale revenue", { exact: true }));
    void firstSug;
    // cursor just left of the first Accept button (found above), settled after boxes are known
    const fa = boxes.suggested?.firstAccept;
    if (fa) await cursorTo(page, fa.x - 26, fa.cy + 2);
    await page.screenshot({ path: path.join(STILLS_DIR, "today-suggested.png") });

    fs.writeFileSync(BOXES_PATH, JSON.stringify(boxes, null, 2));
    console.log(`\nWrote stills to ${STILLS_DIR} and boxes to ${BOXES_PATH}`);
    await context.close();
  } finally {
    await browser.close();
  }
}
await main();
