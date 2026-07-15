// The browser frame's fixed placement in composition space (1920x1080).
// Demo v3: near edge-to-edge. Uniform ~40px margins so the app FILLS the frame
// (symmetric, minimal white space) instead of floating in a narrow centered box.
export const FRAME = { x: 40, y: 40, w: 1840, h: 1000 } as const;
export const FRAME_BAR = 40; // top chrome bar height

// The footage viewport inside the frame (below the bar).
export const VIEW = {
  x: FRAME.x,
  y: FRAME.y + FRAME_BAR,
  w: FRAME.w,
  h: FRAME.h - FRAME_BAR,
} as const;

// App footage is captured at 1920x1080 and shown object-fit: cover in the VIEW.
export const APP_W = 1920;
export const APP_H = 1080;
