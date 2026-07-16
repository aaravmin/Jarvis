import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { clamp01, easeOutCubic } from "../motion";

/**
 * A simple green "done" mark anchored on the checkbox a task was just checked off on: one soft
 * expanding ring and a green check stamp that springs in and holds. It punctuates green = done and
 * sits over the app's in-place toggle (which keeps a subtle spinner while it refreshes). Fires at
 * scene-relative `start`; the stamp holds until `fadeStart`, then eases out over ~12f. Kept deliberately
 * clean - no particle burst.
 */
export const DoneStamp: React.FC<{ x: number; y: number; start: number; fadeStart: number }> = ({
  x,
  y,
  start,
  fadeStart,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame - start;
  if (t < 0) return null;

  // one soft expanding ring (first ~28f)
  const ringP = clamp01(t / 26);
  const ringR = 8 + 48 * easeOutCubic(ringP);
  const ringOpacity = t < 6 ? (t / 6) * 0.85 : (1 - clamp01((t - 6) / 22)) * 0.85;

  // stamp pop (spring), holds, then fades from fadeStart
  const pop = spring({ frame: t, fps, config: { damping: 13, mass: 0.7, stiffness: 130 }, durationInFrames: 22 });
  const fade = frame < fadeStart ? 1 : 1 - clamp01((frame - fadeStart) / 12);
  const stampScale = 0.4 + 0.6 * pop;
  const D = 40; // stamp disc diameter (comfortably covers the ~21px on-screen checkbox)

  return (
    <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0, pointerEvents: "none" }}>
      {/* soft ring */}
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
      {/* green check stamp */}
      <div
        style={{
          position: "absolute",
          left: -D / 2,
          top: -D / 2,
          width: D,
          height: D,
          borderRadius: 12,
          background: theme.successSoft,
          border: `2px solid ${theme.success}`,
          boxShadow: "0 4px 14px rgba(22,163,74,0.28)",
          transform: `scale(${stampScale})`,
          opacity: fade,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={D * 0.62} height={D * 0.62} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 12.5l4 4L19 7"
            stroke={theme.success}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};
