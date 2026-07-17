/**
 * Jarvis design tokens, mirrored from the app's globals.css.
 * Light-first canvas. Red = urgency ONLY. Green = done / positive ONLY.
 * ONE warm accent (caramel/amber) is allowed for brand/neutral emphasis in the film's overlays only -
 * it never carries a status and is used sparingly (intro eyebrow + rule, the neutral caption bar, the
 * Otto close). Everything else stays neutral ink so attention is still carried by red/green.
 */
import { SERIF, SANS, WORDMARK } from "./fonts";

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

  // Brown Bee Coffee brand palette (the demo business's OWN mark, used only in the intro title +
  // its wordmark / rule / eyebrow). `beeAmber` is the marigold honeycomb-cell hexagon; `beeBrownDark`
  // is the small dot inside it; `beeBrown` is the refined wordmark / eyebrow ink. Never a status color.
  beeAmber: "#F4B500",
  beeBrownDark: "#3D2817",
  beeBrown: "#6B4A2E",
} as const;

// Warm, characterful pairing for the film's overlays. `serif` (Fraunces) = display / title cards;
// `sans` (Figtree) = captions, eyebrows, small labels. Both are loaded via @remotion/google-fonts
// (see ./fonts.ts) so they are embedded in the render, not a system fallback.
export const font = {
  serif: SERIF,
  sans: SANS,
  // The homey rounded "Otto" wordmark face (Baloo 2), matching the app's --font-otto wordmark.
  wordmark: WORDMARK,
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

// Story v2 spine (frames @ 30fps). The three TEXT cards + the four near-static FOCUS scenes are fixed
// durations; only the LOOP scene (SC6b) derives its length from the real hero take (see windows.ts).
// The focus scenes are driven by pre-extracted STILLS (crisp, no video-decode blank under slow-mo), so
// they need no footage window - just a duration to hold the context -> zoom -> context beat.
//  intro     (SC1)  -> the "Otto" wordmark + promise (the tool leads)
//  example   (SC2)  -> "An example: Maya runs Brown Bee Coffee" + the scattered-sources problem
//  goals     (SC3)  -> her goals + weekly goals (the lens), zoom into "Grow wholesale revenue"
//  connect   (SC4)  -> reads it all, ties every task to a goal (zoom the "Land 10 new cafe accounts" chip)
//  day       (SC5)  -> the day in priority order (zoom the red reply she owes)
//  suggested (SC6a) -> it only suggests, you approve (zoom a suggestion's weekly-goal chip)
//  close     (SC7)  -> the plain "Otto" wordmark + promise + "Example shown: Brown Bee Coffee" footnote
export const DUR = {
  intro: 120, // 4.0s
  example: 150, // 5.0s
  goals: 184, // 6.1s
  connect: 197, // 6.6s
  day: 159, // 5.3s
  suggested: 130, // 4.3s
  close: 138, // 4.6s
} as const;

/** Frames each scene-to-scene transition overlaps (directional slide / fade). */
export const TRANS = 16;
