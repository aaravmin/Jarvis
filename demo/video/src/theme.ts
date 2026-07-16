/**
 * Jarvis design tokens, mirrored from the app's globals.css.
 * Light-first canvas. Red = urgency ONLY. Green = done / positive ONLY.
 * ONE warm accent (caramel/amber) is allowed for brand/neutral emphasis in the film's overlays only -
 * it never carries a status and is used sparingly (intro eyebrow + rule, the neutral caption bar, the
 * Otto close). Everything else stays neutral ink so attention is still carried by red/green.
 */
import { SERIF, SANS } from "./fonts";

export const theme = {
  // Canvas + surfaces
  background: "#f7f8f9",
  surface: "#ffffff",
  surface2: "#ffffff",
  surface3: "#f0f2f4",
  border: "#e5e8eb",
  borderStrong: "#cfd6dc",

  // Ink
  foreground: "#111827",
  ink: "#334155",
  inkStrong: "#1e293b",
  muted: "#64748b",
  mutedStrong: "#374151",

  // Accent (neutral slate ink; never reads as a status)
  accent: "#334155",
  accentStrong: "#1e293b",
  accentSoft: "#e9eef5",

  // Status (the only loud colors)
  danger: "#dc2626",
  dangerSoft: "#fee2e2",
  success: "#16a34a",
  successSoft: "#dcfce7",
  warning: "#d97706",

  // Warm brand accent (caramel/amber) - a coffee-roastery warmth. NOT a status color.
  // Used sparingly in overlays only (never on the app footage). `caramel` reads with strong
  // contrast on the light canvas; `caramelSoft` is for large brand type / on darker fields.
  caramel: "#B45309",
  caramelSoft: "#C2703D",
} as const;

// Warm, characterful pairing for the film's overlays. `serif` (Fraunces) = display / title cards;
// `sans` (Figtree) = captions, eyebrows, small labels. Both are loaded via @remotion/google-fonts
// (see ./fonts.ts) so they are embedded in the render, not a system fallback.
export const font = {
  serif: SERIF,
  sans: SANS,
  mono: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace',
} as const;

// Soft, layered card shadow that matches the app's rounded-2xl surfaces.
export const shadow = {
  card: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.08)",
  cardLg: "0 4px 12px rgba(16,24,40,0.06), 0 24px 64px rgba(16,24,40,0.14)",
  float: "0 10px 30px rgba(16,24,40,0.12), 0 30px 80px rgba(16,24,40,0.16)",
  ring: "0 0 0 1px rgba(16,24,40,0.04)",
} as const;

export const fps = 30;

// Motion v2 spine (frames @ 30fps). Scenes are sequenced with @remotion/transitions, so these are plain
// durations (not absolute boundaries); each scene-to-scene transition overlaps TRANS frames. The HERO
// scene's duration is derived from the real capture (see hero.ts) and is not listed here.
//  intro     -> the Driftwood emblem assembles + the wordmark
//  today     -> the red Overdue / Sam needs-reply attention beat (calm)
//  suggested -> the Suggested approval gate at the end of Today (calm)
//  hero      -> the continuous take: Today -> click Tasks -> check off (green) -> click Goals (motion)
//  close     -> the plain "Otto" wordmark, text only
export const DUR = {
  intro: 120, // 4.0s
  today: 214, // 7.1s
  suggested: 166, // 5.5s
  close: 106, // 3.5s
} as const;

/** Frames each scene-to-scene transition overlaps (directional slide / fade). */
export const TRANS = 16;
