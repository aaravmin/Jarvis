import React from "react";
import { useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { clamp01, easeOutCubic } from "../motion";

/**
 * Our take on the Screen-Studio click highlight: NOT the default blue dot. A caramel-tinted set that
 * matches the app's rounded aesthetic - a soft filled press-flash, an expanding ROUNDED-SQUARE pulse
 * (echoing the app's rounded cards), and a trailing caramel ring. Rendered at a view-local point,
 * firing at scene-relative frame `start`.
 */
export const ClickRipple: React.FC<{ x: number; y: number; start: number; tint?: string }> = ({
  x,
  y,
  start,
  tint = theme.caramel,
}) => {
  const frame = useCurrentFrame();
  const t = frame - start;
  const LEN = 24;
  if (t < 0 || t > LEN) return null;

  const p = t / LEN; // 0..1

  // Press flash: a soft filled disc that blooms and fades in the first third (the "press").
  const flashP = clamp01(t / 8);
  const flashSize = 16 + 26 * easeOutCubic(flashP);
  const flashOpacity = (1 - flashP) * 0.5;

  // Rounded-square pulse: expands from the press point, border only, fades over the full length.
  const sq = easeOutCubic(p);
  const sqSize = 26 + 116 * sq;
  const sqOpacity = (1 - p) * 0.85;
  const sqRadius = 10 + 16 * sq;

  // Trailing ring (circle), slightly delayed - the "double" read.
  const r2 = easeOutCubic(clamp01((t - 4) / (LEN - 4)));
  const ringSize = 18 + 92 * r2;
  const ringOpacity = t > 4 ? (1 - clamp01((t - 4) / (LEN - 4))) * 0.55 : 0;

  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}>
      {/* press flash */}
      <div
        style={{
          position: "absolute",
          left: -flashSize / 2,
          top: -flashSize / 2,
          width: flashSize,
          height: flashSize,
          borderRadius: 999,
          background: tint,
          opacity: flashOpacity,
          filter: "blur(0.5px)",
        }}
      />
      {/* rounded-square pulse */}
      <div
        style={{
          position: "absolute",
          left: -sqSize / 2,
          top: -sqSize / 2,
          width: sqSize,
          height: sqSize,
          borderRadius: sqRadius,
          border: `3px solid ${tint}`,
          opacity: sqOpacity,
        }}
      />
      {/* trailing ring */}
      <div
        style={{
          position: "absolute",
          left: -ringSize / 2,
          top: -ringSize / 2,
          width: ringSize,
          height: ringSize,
          borderRadius: 999,
          border: `2px solid ${theme.caramelSoft}`,
          opacity: ringOpacity,
        }}
      />
    </div>
  );
};
