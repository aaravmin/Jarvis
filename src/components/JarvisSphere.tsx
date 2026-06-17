"use client";

import type { CSSProperties } from "react";
import type { OrbState } from "@/components/JarvisOrb";

/**
 * The Jarvis particle sphere — a glowing orb of cyan particles with an ORGANIC, creviced rim (not a
 * perfect circle) and the "JARVIS" wordmark at its core. It PULSATES (breathes + the glow swells) and
 * the creviced membrane slowly morphs by counter-rotating two irregular outlines.
 *
 * Everything is DETERMINISTIC (Vogel/golden-angle particles + sine-harmonic rim, no Math.random) so
 * server and client render identically — no hydration mismatch. `state` brightens + speeds it up when
 * Jarvis is listening or thinking.
 */

const VB = 100;
const C = VB / 2;
const R = 40; // base sphere radius within the 100x100 viewBox

// ---- particle field --------------------------------------------------------
const N = 86;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const PARTICLES = Array.from({ length: N }, (_, i) => {
  const t = (i + 0.5) / N;
  const r = Math.sqrt(t);
  const a = i * GOLDEN;
  return {
    cx: C + (R - 2) * r * Math.cos(a),
    cy: C + (R - 2) * r * Math.sin(a),
    rad: 0.45 + 1.05 * (0.35 + 0.65 * r),
    max: 0.35 + 0.6 * r,
    delay: (((i * 7) % N) / N) * 3,
    dur: 2.2 + (i % 5) * 0.5,
  };
});

// ---- creviced rim ----------------------------------------------------------
// A closed outline whose radius wobbles via a few sine harmonics → organic lumps + crevices.
// Blurred, this reads as a luminous membrane; two phase-shifted copies counter-rotate to morph it.
function rimPath(amp: number, phase: number): string {
  const STEPS = 72;
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2;
    const wob =
      Math.sin(a * 3 + phase) * 0.5 +
      Math.sin(a * 5 + phase * 1.7 + 1.3) * 0.3 +
      Math.sin(a * 8 + phase * 0.6 + 2.1) * 0.2;
    const r = R + amp * wob;
    pts.push(`${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

const RIM_A = rimPath(3.2, 0);
const RIM_B = rimPath(2.6, 2.2);

export function JarvisSphere({
  state = "idle",
  size = 300,
}: {
  state?: OrbState;
  size?: number;
}) {
  const active = state !== "idle";
  const spin = active ? "jarvis-spin-med" : "jarvis-spin-slow";

  return (
    <div
      className="jarvis-breathe relative grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Ambient outer glow — swells with the pulse */}
      <div
        className="jarvis-glow-pulse absolute inset-0 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.45) 0%, rgba(14,165,233,0.13) 50%, transparent 72%)",
        }}
      />

      <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id="jarvis-body" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="rgba(230,247,255,0.30)" />
            <stop offset="45%" stopColor="rgba(56,189,248,0.11)" />
            <stop offset="100%" stopColor="rgba(8,30,45,0)" />
          </radialGradient>
          <filter id="jarvis-soft" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        {/* Faint 3D-lit body */}
        <circle cx={C} cy={C} r={R} fill="url(#jarvis-body)" />

        {/* Creviced membrane: two counter-rotating irregular outlines, blurred into a glowing rim */}
        <g className="jarvis-spin-slow">
          <path d={RIM_A} fill="none" stroke="rgba(56,189,248,0.8)" strokeWidth={active ? 1.0 : 0.7} filter="url(#jarvis-soft)" />
          <path d={RIM_A} fill="none" stroke="rgba(230,247,255,0.55)" strokeWidth="0.3" />
        </g>
        <g className="jarvis-spin-slow-rev">
          <path d={RIM_B} fill="none" stroke="rgba(14,165,233,0.55)" strokeWidth={active ? 0.9 : 0.6} filter="url(#jarvis-soft)" />
        </g>

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
