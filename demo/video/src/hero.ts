/**
 * Derives the HERO scene's timing from the real capture: the continuous take navigates Today -> Tasks
 * -> Goals via real in-app clicks, and clicks.json records exactly when + where each happened. Here we
 * turn that into (a) the trim + playback the Footage should use and (b) scene-relative FxClicks (frame +
 * view-local coords + kind) the ClickFx layer syncs its ripple / zoom / page-switch to.
 */
import { fps } from "./theme";
import { getClip, clipStartFrom } from "./footage";
import { getClicks } from "./clicks";
import { pageToView } from "./motion";
import type { FxClick } from "./components/ClickFx";

const LEAD_SEC = 1.8; // how long the scene lingers before the first click
const TAIL_SEC = 5.4; // how long it holds after the last click (lands + settles on Goals)
const PLAYBACK = 1.0; // natural speed - the motion FX carry the energy, not a fast-forward
const STRIKE_SEC = 1.14; // footage time from the check click to the strike-through/green landing

function kindOf(label: string): FxClick["kind"] {
  if (label.startsWith("nav:")) return "nav";
  if (label.startsWith("check:")) return "check";
  return "tap";
}

function build() {
  const clip = getClip("hero");
  const raw = getClicks("hero").slice().sort((a, b) => a.tSec - b.tSec);
  const clipDur = clip?.durationSec ?? null;

  if (!clip || clipDur == null || raw.length === 0) {
    return {
      available: false,
      playbackRate: PLAYBACK,
      trimStart: 0,
      duration: 440,
      clicks: [] as FxClick[],
      urlSwitches: [{ frame: 0, url: "today" }],
    };
  }

  const firstT = raw[0].tSec;
  const lastT = raw[raw.length - 1].tSec;
  const videoStartSec = Math.max(0.3, firstT - LEAD_SEC);
  const videoEndSec = Math.min(clipDur - 0.3, lastT + TAIL_SEC);
  const shownSec = Math.max(1, videoEndSec - videoStartSec);

  const duration = Math.round((shownSec * fps) / PLAYBACK);
  const trimStart = Math.round(videoStartSec * fps) - clipStartFrom();

  const toFrame = (tSec: number) => Math.round(((tSec - videoStartSec) * fps) / PLAYBACK);

  const clicks: FxClick[] = raw.map((c) => {
    const v = pageToView(c.x, c.y);
    const kind = kindOf(c.label);
    return {
      frame: toFrame(c.tSec),
      x: v.x,
      y: v.y,
      kind,
      stampDelay: kind === "check" ? Math.round((STRIKE_SEC * fps) / PLAYBACK) : undefined,
    };
  });

  // The URL pill tracks the real navigation: it flips a few frames after each nav click (when the page
  // actually swaps in the footage), so localhost:3000/today -> /tasks -> /goals reads as it happens.
  const urlSwitches: Array<{ frame: number; url: string }> = [{ frame: 0, url: "today" }];
  for (const c of raw) {
    // Flip ~0.6s after the click, i.e. when the real client-side nav has actually swapped the page in
    // the footage (and as the caramel page-switch sweep finishes), so the pill never leads the content.
    if (c.label.startsWith("nav:")) urlSwitches.push({ frame: toFrame(c.tSec) + 18, url: c.label.slice(4) });
  }

  return { available: true, playbackRate: PLAYBACK, trimStart, duration, clicks, urlSwitches };
}

export const HERO = build();
