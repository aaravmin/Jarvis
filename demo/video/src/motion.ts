/**
 * Motion helpers for the Screen-Studio-inspired click/zoom/page-switch layer.
 *
 * Coordinate spaces:
 *  - PAGE space: the raw 1920x1080 capture viewport that clicks.json records in.
 *  - VIEW space: inside the browser frame, below the chrome bar. The footage is object-fit:cover,
 *    top-aligned, so page (px,py) maps to view (px*APP_SCALE, py*APP_SCALE).
 */
import { FRAME, FRAME_BAR, APP_W } from "./layout";

/** Cover scale of the 1920-wide capture into the frame's viewport (width-driven). */
export const APP_SCALE = FRAME.w / APP_W; // 1840/1920 = 0.95833...

/** Browser-frame viewport size (the clipped area the footage + FX live in). */
export const VIEW_W = FRAME.w;
export const VIEW_H = FRAME.h - FRAME_BAR;

/** page (1920x1080) -> view-local px inside the browser frame. */
export const pageToView = (x: number, y: number) => ({ x: x * APP_SCALE, y: y * APP_SCALE });

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Ken Perlin's smootherstep - a soft S with zero first+second derivative at the ends. */
export const smoother = (t: number) => {
  t = clamp01(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Ease-out cubic (fast start, gentle settle) - good for expanding rings. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/** Ease-out back: overshoots past 1 then settles - the springy "pop". */
export const easeOutBack = (t: number, s = 1.7) => {
  t = clamp01(t);
  const x = t - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};

/**
 * A 0..1 attention pulse relative to a click at frame `c`: eases up over `rise` (starting `pre` frames
 * early), holds flat for `hold`, eases back down over `fall`. Used to drive the zoom-on-click envelope.
 */
export function pulse(
  f: number,
  c: number,
  { pre = 3, rise = 12, hold = 40, fall = 18 }: { pre?: number; rise?: number; hold?: number; fall?: number },
): number {
  if (f <= c - pre) return 0;
  if (f < c + rise) return smoother((f - (c - pre)) / (rise + pre));
  if (f <= c + rise + hold) return 1;
  if (f < c + rise + hold + fall) return 1 - smoother((f - (c + rise + hold)) / fall);
  return 0;
}

/**
 * A FOCUS + CONTEXT zoom target. Unlike the click-driven zoom, this is scripted to a caption beat: the
 * framed footage eases from the full dashboard (scale 1 = context) INTO a specific element (scale > 1,
 * origin x/y), HOLDS while the caption explains it, then eases back OUT to the whole surface so the
 * viewer re-orients where it lives. Coordinates are VIEW-local px (inside the browser frame); build them
 * from page-space with `pageToView`. All frames are scene-relative.
 */
export type Focus = {
  inStart: number; // frame the zoom-in begins (context held before this)
  inEnd: number; // frame it is fully zoomed by (hold begins)
  outStart: number; // frame the zoom-out begins (hold ends)
  outEnd: number; // frame it is back to full context
  x: number; // view-local origin px
  y: number;
  scale: number; // peak zoom (e.g. 1.5-2.1)
};

/** Current scale of a focus target at frame `f` (1 = full context). Smootherstep in and out so the
 * push is gentle and purposeful, never flashy. */
export function focusScale(f: number, ph: Focus): number {
  if (f <= ph.inStart) return 1;
  if (f < ph.inEnd) return 1 + (ph.scale - 1) * smoother((f - ph.inStart) / (ph.inEnd - ph.inStart));
  if (f <= ph.outStart) return ph.scale;
  if (f < ph.outEnd) return ph.scale + (1 - ph.scale) * smoother((f - ph.outStart) / (ph.outEnd - ph.outStart));
  return 1;
}

/**
 * The nav-click "push": a quick scale recoil around the clicked nav item - dip in, overshoot, settle -
 * that punctuates the real page switch happening in the footage at the same instant.
 */
export function navPush(f: number, c: number): number {
  const pts: Array<[number, number]> = [
    [c - 1, 1],
    [c + 6, 0.98],
    [c + 15, 1.006],
    [c + 24, 1.0],
  ];
  if (f <= pts[0][0]) return 1;
  if (f >= pts[pts.length - 1][0]) return 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [f0, v0] = pts[i];
    const [f1, v1] = pts[i + 1];
    if (f >= f0 && f < f1) return v0 + (v1 - v0) * smoother((f - f0) / (f1 - f0));
  }
  return 1;
}
