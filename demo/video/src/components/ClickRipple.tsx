import React from "react";
import { useCurrentFrame } from "remotion";
import { clamp01, easeOutCubic } from "../motion";

/**
 * A single, clean click pulse - deliberately simple (no caramel, no double-ring / rounded-square /
 * trailing-ring). One soft press dot + one expanding ring, both in the click's status color:
 *   - GREEN  for a positive / completion action (a check-off),
 *   - RED    where the context is urgent / overdue,
 *   - NEUTRAL slate for a plain navigation click (smaller + softer via `strength`).
 * Rendered at a view-local point, firing at scene-relative frame `start`.
 */
export const ClickRipple: React.FC<{
  x: number;
  y: number;
  start: number;
  tint: string;
  strength?: number; // 1 = full (check); < 1 shrinks + softens (nav)
}> = ({ x, y, start, tint, strength = 1 }) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const LEN = 20;
  if (t < 0 || t > LEN) return null;

  const p = t / LEN; // 0..1

  // Soft press dot: a small filled disc that blooms and fades in the first third (the "press").
  const dotP = clamp01(t / 7);
  const dotSize = (11 + 9 * easeOutCubic(dotP)) * strength;
  const dotOpacity = (1 - dotP) * 0.3 * strength;

  // One expanding ring, fading over the full length.
  const ring = easeOutCubic(p);
  const ringSize = (18 + 62 * ring) * strength;
  const ringOpacity = (1 - p) * 0.62 * strength;

  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: -dotSize / 2,
          top: -dotSize / 2,
          width: dotSize,
          height: dotSize,
          borderRadius: 999,
          background: tint,
          opacity: dotOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -ringSize / 2,
          top: -ringSize / 2,
          width: ringSize,
          height: ringSize,
          borderRadius: 999,
          border: `2px solid ${tint}`,
          opacity: ringOpacity,
        }}
      />
    </div>
  );
};
