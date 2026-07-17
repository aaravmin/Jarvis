/**
 * Builds a scene from an arbitrary time window of a captured clip: the footage trim + derived duration
 * for a given playback rate, plus (for the continuous hero take) the real clicks that fall inside the
 * window remapped to scene-relative frames, and the URL-pill switches for any in-window navigation.
 *
 * This generalizes the old single-purpose hero.ts so the v2 cut can slice the SAME clips into several
 * differently-framed scenes: the hero clip yields both the Goals establish (SC3) and the loop close
 * (SC6b), and the today clip yields the connect / day / suggested beats.
 */
import { fps } from "./theme";
import { getClip, clipStartFrom } from "./footage";
import { getClicks } from "./clicks";
import { pageToView } from "./motion";
import type { FxClick } from "./components/ClickFx";

const STRIKE_SEC = 1.14; // footage time from a check click to the strike-through / green landing

function kindOf(label: string): FxClick["kind"] {
  if (label.startsWith("nav:")) return "nav";
  if (label.startsWith("check:")) return "check";
  return "tap";
}

export type ClipWindow = {
  available: boolean;
  trimStart: number; // frames into the usable clip (Footage adds clipStartFrom() back); may be negative
  duration: number; // scene length in frames at `playbackRate`
  playbackRate: number;
  clicks: FxClick[];
  urlSwitches: Array<{ frame: number; url: string }>;
};

/**
 * @param clipId    manifest clip id (e.g. "today", "hero")
 * @param startSec  video time (s) the scene should begin on
 * @param endSec    video time (s) the scene should end on
 * @param playback  playback rate (<1 = slow-mo; the focus zoom carries the motion on near-static beats)
 * @param baseUrl   the URL-pill path at the window's start
 * @param clickTrack clicks.json key to pull real clicks from (only the hero take has any)
 */
export function buildWindow(
  clipId: string,
  startSec: number,
  endSec: number,
  { playback = 1, baseUrl = "today", clickTrack }: { playback?: number; baseUrl?: string; clickTrack?: string } = {},
): ClipWindow {
  const clip = getClip(clipId);
  const clipDur = clip?.durationSec ?? null;

  if (!clip || clipDur == null) {
    return {
      available: false,
      trimStart: 0,
      duration: Math.max(1, Math.round(((endSec - startSec) * fps) / playback)),
      playbackRate: playback,
      clicks: [],
      urlSwitches: [{ frame: 0, url: baseUrl }],
    };
  }

  const videoStart = Math.max(0.1, Math.min(startSec, clipDur - 0.5));
  const videoEnd = Math.max(videoStart + 0.4, Math.min(endSec, clipDur - 0.1));
  const shownSec = videoEnd - videoStart;
  const duration = Math.max(1, Math.round((shownSec * fps) / playback));
  const trimStart = Math.round(videoStart * fps) - clipStartFrom();
  const toFrame = (tSec: number) => Math.round(((tSec - videoStart) * fps) / playback);

  const raw = (clickTrack ? getClicks(clickTrack) : [])
    .slice()
    .sort((a, b) => a.tSec - b.tSec)
    .filter((c) => c.tSec >= videoStart && c.tSec <= videoEnd);

  const clicks: FxClick[] = raw.map((c) => {
    const v = pageToView(c.x, c.y);
    const kind = kindOf(c.label);
    return {
      frame: toFrame(c.tSec),
      x: v.x,
      y: v.y,
      kind,
      stampDelay: kind === "check" ? Math.round((STRIKE_SEC * fps) / playback) : undefined,
    };
  });

  const urlSwitches: Array<{ frame: number; url: string }> = [{ frame: 0, url: baseUrl }];
  for (const c of raw) {
    // Flip ~0.9s after a nav click, i.e. when the real client-side nav has actually painted the new
    // page in the footage (measured off the hero take), so the pill never leads the content on screen.
    if (c.label.startsWith("nav:")) urlSwitches.push({ frame: toFrame(c.tSec) + Math.round(27 / playback), url: c.label.slice(4) });
  }

  return { available: true, trimStart, duration, playbackRate: playback, clicks, urlSwitches };
}
