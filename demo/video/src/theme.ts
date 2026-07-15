/**
 * Jarvis design tokens, mirrored from the app's globals.css.
 * Light-first canvas. Red = urgency ONLY. Green = done / positive ONLY.
 * Everything else is neutral ink so attention is carried by the two status colors.
 */
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
} as const;

export const font = {
  sans: 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
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
// Otto cut (~1 min, product-led): open on a clean Driftwood Roasters intro card (NO branded
// graphic, no attention motif), then a handful of app surfaces each shown as real footage
// FILLING a big browser frame with one short caption, then a plain "Otto" text close. Brisk
// but NOT frantic - every section breathes 6-13s so the eye can read the real UI.
export const SCENES = {
  intro: { from: 0, duration: 90 }, // 3.0s  Driftwood Roasters intro card (text only)
  today: { from: 90, duration: 456 }, // 15.2s overdue red + Sam needs-reply (the RED highlight)
  suggested: { from: 546, duration: 216 }, // 7.2s  the Suggested section at the end of Today (approve gate)
  tasks: { from: 762, duration: 288 }, // 9.6s  the sheet + check-off going green (the GREEN highlight)
  cmdk: { from: 1050, duration: 186 }, // 6.2s  Cmd-K palette -> highlights Goals (nav into the next scene)
  goals: { from: 1236, duration: 345 }, // 11.5s weekly goals + grounded in your goals ("Linked (2)")
  close: { from: 1581, duration: 114 }, // 3.8s  plain "Otto" wordmark
} as const;

export const TOTAL_FRAMES = SCENES.close.from + SCENES.close.duration; // 1695 = 56.5s
