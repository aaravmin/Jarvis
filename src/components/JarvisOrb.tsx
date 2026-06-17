"use client";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

/**
 * The Jarvis "arc-reactor" orb. Pure CSS/SVG (no 3D dependency), themed to the app's cyan accent.
 * Reacts to state (idle/listening/thinking/speaking) and live mic amplitude (0..1).
 */
export function JarvisOrb({
  state = "idle",
  amplitude = 0,
  size = 240,
}: {
  state?: OrbState;
  amplitude?: number;
  size?: number;
}) {
  const amp = Math.max(0, Math.min(1, amplitude));
  const scale = state === "listening" ? 1 + amp * 0.2 : 1;
  const active = state !== "idle";

  return (
    <div
      className="relative grid place-items-center transition-transform duration-100"
      style={{ width: size, height: size, transform: `scale(${scale})` }}
      aria-hidden
    >
      {/* Outer ambient glow */}
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.45) 0%, rgba(14,165,233,0.18) 45%, transparent 70%)",
          opacity: active ? 0.9 : 0.6,
        }}
      />

      {/* Expanding pulse rings while listening / speaking */}
      {(state === "listening" || state === "speaking") && (
        <>
          <span className="orb-pulse-ring absolute inset-6 rounded-full border border-accent/50" />
          <span
            className="orb-pulse-ring absolute inset-6 rounded-full border border-accent/40"
            style={{ animationDelay: "0.8s" }}
          />
        </>
      )}

      {/* Rotating reactor ring (conic gradient) */}
      <div
        className={`absolute inset-2 rounded-full ${state === "thinking" ? "orb-spin-fast" : "orb-spin"}`}
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(56,189,248,0.0) 200deg, rgba(56,189,248,0.9) 320deg, #e6f7ff 350deg, transparent 360deg)",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))",
          WebkitMask:
            "radial-gradient(farthest-side, transparent calc(100% - 6px), #000 calc(100% - 5px))",
        }}
      />

      {/* Counter-rotating inner ring */}
      <div
        className="orb-spin-rev absolute inset-8 rounded-full border border-accent/20"
        style={{
          background:
            "conic-gradient(from 180deg, transparent 0deg, rgba(14,165,233,0.5) 90deg, transparent 200deg)",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
          WebkitMask:
            "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
        }}
      />

      {/* Core */}
      <div
        className="orb-breathe absolute inset-[28%] rounded-full border border-accent/40"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, rgba(230,247,255,0.95), rgba(56,189,248,0.55) 40%, rgba(12,37,51,0.9) 75%)",
          boxShadow: "0 0 40px 6px rgba(56,189,248,0.45), inset 0 0 24px rgba(56,189,248,0.5)",
        }}
      />

      {/* Bright center node */}
      <div
        className="absolute h-3 w-3 rounded-full bg-white"
        style={{ boxShadow: "0 0 16px 4px var(--color-accent)" }}
      />
    </div>
  );
}
