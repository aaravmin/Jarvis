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
export const SCENES = {
  intro: { from: 0, duration: 240 },
  premise: { from: 240, duration: 420 },
  goals: { from: 660, duration: 540 },
  ingest: { from: 1200, duration: 460 },
  review: { from: 1660, duration: 820 },
  today: { from: 2480, duration: 1480 },
  montage: { from: 3960, duration: 740 },
  rules: { from: 4700, duration: 550 },
  outro: { from: 5250, duration: 690 },
} as const;

export const TOTAL_FRAMES = SCENES.outro.from + SCENES.outro.duration; // 5940 = 3:18
