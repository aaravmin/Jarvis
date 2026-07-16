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

// Absolute scene boundaries (frames @ 30fps). End of last scene = total duration.
// Otto cut, tightened: open on a clean Driftwood Roasters intro card, then a handful of app surfaces each
// shown as real footage FILLING a big browser frame with at most one short caption, then a plain "Otto"
// text close. Brisk - each surface breathes ~5-10s so the eye can read the real UI, but nothing lingers.
// The Cmd-K palette scene was cut (cmdk.webm is now unused, kept on disk).
export const SCENES = {
  intro: { from: 0, duration: 80 }, // 2.7s  Driftwood Roasters intro card (text only)
  today: { from: 80, duration: 300 }, // 10.0s overdue red + Sam needs-reply (the RED highlight)
  suggested: { from: 380, duration: 150 }, // 5.0s  the Suggested section at the end of Today (approve gate)
  tasks: { from: 530, duration: 205 }, // 6.8s  the sheet + check-off going green (the GREEN highlight)
  goals: { from: 735, duration: 210 }, // 7.0s  weekly goals nested under each big goal
  close: { from: 945, duration: 82 }, // 2.7s  plain "Otto" wordmark
} as const;

export const TOTAL_FRAMES = SCENES.close.from + SCENES.close.duration; // 1027 = 34.2s
