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
// DEMO v3 (~1 min, product-led): a short branded open, a handful of app surfaces
// each shown as real footage FILLING a big browser frame with one short caption,
// then a short branded close. Brisk but NOT frantic - every section breathes 7-16s
// so the eye can read the real UI. No rapid-cut set-pieces.
export const SCENES = {
  open: { from: 0, duration: 105 }, // 3.5s  GOTT wordmark + tagline
  today: { from: 105, duration: 360 }, // 12.0s overdue red + Sam needs-reply (the RED highlight)
  review: { from: 465, duration: 246 }, // 8.2s  approve what it found (suggest-only)
  tasks: { from: 711, duration: 450 }, // 15.0s the sheet + check-off going green (the GREEN highlight)
  cmdk: { from: 1161, duration: 180 }, // 6.0s  Cmd-K palette -> highlights Goals (nav into the next scene)
  goals: { from: 1341, duration: 264 }, // 8.8s  grounded in your goals ("Linked (2)")
  close: { from: 1605, duration: 126 }, // 4.2s  GOTT wordmark returns
} as const;

export const TOTAL_FRAMES = SCENES.close.from + SCENES.close.duration; // 1731 = 57.7s
