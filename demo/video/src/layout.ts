import type { Region } from "./components/Callout";

// The browser frame's fixed placement in composition space (1920x1080).
export const FRAME = { x: 220, y: 101, w: 1480, h: 879 } as const;
export const FRAME_BAR = 46; // top chrome bar height

// The footage viewport inside the frame (below the bar).
export const VIEW = {
  x: FRAME.x,
  y: FRAME.y + FRAME_BAR,
  w: FRAME.w,
  h: FRAME.h - FRAME_BAR,
} as const;

// App screenshots are captured at 1920x1080; scale to fit the viewport width.
export const APP_W = 1920;
export const APP_H = 1080;
export const CONTENT_SCALE = VIEW.w / APP_W; // ~0.7708

/**
 * Map an app-space region (from the capture agent's region hints, in 1920x1080
 * screenshot coords) into composition space, accounting for the BrowserFrame's
 * scale-push and Ken-Burns pan at the moment the callout is on screen.
 *
 * push: the frame's current scale (1.00..~1.05). pan: px drift already applied.
 */
export const appToComp = (
  r: Region,
  opts: { push?: number; panX?: number; panY?: number } = {}
): Region => {
  const { push = 1, panX = 0, panY = 0 } = opts;
  const cs = CONTENT_SCALE;

  // base position (no push)
  const bx = VIEW.x + r.x * cs;
  const by = VIEW.y + r.y * cs;
  const bw = r.w * cs;
  const bh = r.h * cs;

  // viewport center that the push scales about
  const vcx = VIEW.x + VIEW.w / 2;
  const vcy = VIEW.y + VIEW.h / 2;

  const px = vcx + (bx - vcx) * push + panX;
  const py = vcy + (by - vcy) * push + panY;

  return { x: px, y: py, w: bw * push, h: bh * push };
};
