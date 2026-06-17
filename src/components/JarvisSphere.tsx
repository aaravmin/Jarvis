"use client";

import type { CSSProperties } from "react";
import type { OrbState } from "@/components/JarvisOrb";

/**
 * The Jarvis particle sphere — a glowing orb made of cyan particles with a luminous rim and the
 * "JARVIS" wordmark at its center (the sleek home hero). Pure SVG/CSS, no 3D dependency.
 *
 * The particle field is DETERMINISTIC (a Vogel / golden-angle spiral, no Math.random) so server and
 * client render identically — no hydration mismatch and no flash. Particles twinkle on staggered
 * delays and the field rotates slowly; `state` brightens the glow and speeds rotation when Jarvis is
 * listening or thinking.
 */

const N = 86;
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ~2.39996 rad
const R = 42; // sphere radius within the 100x100 viewBox

const PARTICLES = Array.from({ length: N }, (_, i) => {
  const t = (i + 0.5) / N;
  const r = Math.sqrt(t); // sqrt → uniform area distribution
  const a = i * GOLDEN;
  return {
    cx: 50 + R * r * Math.cos(a),
    cy: 50 + R * r * Math.sin(a),
    rad: 0.45 + 1.05 * (0.35 + 0.65 * r), // a touch larger toward the rim
    max: 0.35 + 0.6 * r, // brighter toward the rim → reads as a shell
    delay: ((i * 7) % N) / N * 3, // spread twinkle phase across 0..3s
    dur: 2.2 + (i % 5) * 0.5,
  };
});

export function JarvisSphere({
  state = "idle",
  size = 300,
}: {
  state?: OrbState;
  size?: number;
}) {
  const active = state !== "idle";
  const spin = state === "thinking" ? "jarvis-spin-med" : "jarvis-spin-slow";

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-hidden>
      {/* Ambient outer glow */}
      <div
        className="absolute inset-0 rounded-full blur-3xl transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.42) 0%, rgba(14,165,233,0.12) 50%, transparent 72%)",
          opacity: active ? 0.95 : 0.65,
        }}
      />

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="jarvis-body" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="rgba(230,247,255,0.28)" />
            <stop offset="45%" stopColor="rgba(56,189,248,0.10)" />
            <stop offset="100%" stopColor="rgba(8,30,45,0)" />
          </radialGradient>
          <filter id="jarvis-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.3" />
          </filter>
        </defs>

        {/* Faint 3D-lit body */}
        <circle cx="50" cy="50" r={R} fill="url(#jarvis-body)" />

        {/* Luminous rim: a blurred halo ring + a crisp inner edge */}
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="rgba(56,189,248,0.85)"
          strokeWidth={active ? 1.1 : 0.8}
          filter="url(#jarvis-glow)"
        />
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(230,247,255,0.65)" strokeWidth="0.35" />

        {/* Rotating particle field */}
        <g className={spin}>
          {PARTICLES.map((p, i) => (
            <circle
              key={i}
              cx={p.cx}
              cy={p.cy}
              r={p.rad}
              fill="#bfeeff"
              className="jarvis-twinkle"
              style={
                {
                  "--tw-max": p.max,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.dur}s`,
                } as CSSProperties
              }
            />
          ))}
        </g>
      </svg>

      {/* Wordmark at the core */}
      <span
        className="relative z-10 text-sm font-semibold tracking-[0.38em] text-white/90 sm:text-base"
        style={{ textShadow: "0 0 14px rgba(56,189,248,0.85)" }}
      >
        <span className="pl-[0.38em]">JARVIS</span>
      </span>
    </div>
  );
}
