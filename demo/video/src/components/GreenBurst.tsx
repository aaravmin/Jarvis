import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

/**
 * A short green particle burst + ring pulse, anchored at a point (checkbox).
 * Fires once starting at `at` (scene-relative frames). Used on the SC6 checkoff.
 */
export const GreenBurst: React.FC<{ x: number; y: number; at: number; particles?: number }> = ({
  x,
  y,
  at,
  particles = 12,
}) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 34) return null;

  const ringR = interpolate(t, [0, 24], [6, 62], { extrapolateRight: "clamp", easing: (e) => 1 - Math.pow(1 - e, 3) });
  const ringOpacity = interpolate(t, [0, 6, 26], [0, 0.85, 0]);

  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0 }}>
      {/* ring pulse */}
      <div
        style={{
          position: "absolute",
          left: -ringR,
          top: -ringR,
          width: ringR * 2,
          height: ringR * 2,
          borderRadius: 999,
          border: `3px solid ${theme.success}`,
          opacity: ringOpacity,
        }}
      />
      {/* particles */}
      {Array.from({ length: particles }).map((_, i) => {
        const ang = (i / particles) * Math.PI * 2 + 0.3;
        const dist = interpolate(t, [0, 22], [4, 46 + (i % 3) * 10], {
          extrapolateRight: "clamp",
          easing: (e) => 1 - Math.pow(1 - e, 3),
        });
        const px = Math.cos(ang) * dist;
        const py = Math.sin(ang) * dist;
        const size = 7 - (i % 3) * 1.5;
        const op = interpolate(t, [0, 4, 26], [0, 1, 0]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px - size / 2,
              top: py - size / 2,
              width: size,
              height: size,
              borderRadius: 999,
              background: theme.success,
              opacity: op,
            }}
          />
        );
      })}
    </div>
  );
};
