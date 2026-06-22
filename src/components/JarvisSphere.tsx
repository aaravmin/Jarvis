"use client";

import type { OrbState } from "@/components/JarvisOrb";

/**
 * The Jarvis mark, no hard circle, just a soft blue morphing glow with "JARVIS" in white over it.
 * Two counter-rotating gradient blobs morph + drift behind the wordmark and the ambient glow swells;
 * it idles slowly and moves more when listening/thinking (`data-active`). Pure CSS (SSR-safe).
 */
export function JarvisSphere({
  state = "idle",
  size = 300,
}: {
  state?: OrbState;
  size?: number;
}) {
  const active = state !== "idle";
  const fontSize = Math.max(18, Math.round(size * 0.078));

  return (
    <div className="jarvis-orb" data-active={active} style={{ width: size, height: size }} aria-hidden>
      <span className="jarvis-orb__glow" />
      <span className="jarvis-orb__blob jarvis-orb__blob--a" />
      <span className="jarvis-orb__blob jarvis-orb__blob--b" />
      <span className="jarvis-orb__label" style={{ fontSize, paddingLeft: "0.32em" }}>
        JARVIS
      </span>
    </div>
  );
}
