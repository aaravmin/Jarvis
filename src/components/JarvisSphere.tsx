"use client";

import type { OrbState } from "@/components/JarvisOrb";

/**
 * The Jarvis orb — a living, layered, morphing blob (not a circle). Two counter-rotating gradient
 * blobs morph their shape, drift, and glow under a luminous core with a rotating conic sheen and the
 * JARVIS wordmark. It idles slowly; when Jarvis is listening/thinking (`state !== "idle"`) the
 * `data-active` flag speeds the rotation/morph and amplifies the motion + glow — so it "moves more
 * when you talk." All motion is pure CSS (declarative → SSR/hydration-safe).
 */
export function JarvisSphere({
  state = "idle",
  size = 300,
}: {
  state?: OrbState;
  size?: number;
}) {
  const active = state !== "idle";
  const fontSize = Math.max(12, Math.round(size * 0.052));

  return (
    <div className="jarvis-orb" data-active={active} style={{ width: size, height: size }} aria-hidden>
      <span className="jarvis-orb__glow" />
      <span className="jarvis-orb__blob jarvis-orb__blob--a" />
      <span className="jarvis-orb__blob jarvis-orb__blob--b" />
      <span className="jarvis-orb__core">
        <span className="jarvis-orb__sheen" />
        <span className="jarvis-orb__label" style={{ fontSize, paddingLeft: "0.38em" }}>
          JARVIS
        </span>
      </span>
    </div>
  );
}
