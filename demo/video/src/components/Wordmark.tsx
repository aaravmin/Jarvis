import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";

/**
 * GOTT wordmark. Letters stagger up on a spring while the letter-spacing
 * expands from tight to wide. Used in the intro and outro.
 */
export const Wordmark: React.FC<{ size?: number; delay?: number; color?: string }> = ({
  size = 130,
  delay = 0,
  color = theme.foreground,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = "GOTT".split("");

  const spread = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 1.1, stiffness: 60 } });
  const tracking = interpolate(spread, [0, 1], [size * 0.02, size * 0.14]);

  return (
    <div style={{ display: "flex", alignItems: "center", paddingLeft: tracking }}>
      {letters.map((ch, i) => {
        const s = spring({
          frame: frame - delay - i * 4,
          fps,
          config: { damping: 200, mass: 0.8, stiffness: 120 },
        });
        const y = interpolate(s, [0, 1], [size * 0.34, 0]);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity: s,
              marginRight: tracking,
              fontFamily: font.sans,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1,
              color,
              letterSpacing: 0,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Twin status dots (red + green) that orbit a center once and settle into a
 * small paired cluster. `settle` 0..1 blends from orbit into the rest position.
 */
export const TwinDots: React.FC<{
  cx: number;
  cy: number;
  radius?: number;
  dot?: number;
  turns?: number;
  progress: number; // 0..1 across the whole orbit+settle
  restGap?: number;
}> = ({ cx, cy, radius = 26, dot = 14, turns = 1, progress, restGap = 11 }) => {
  // orbit for first 70%, settle for last 30%
  const orbitP = interpolate(progress, [0, 0.7], [0, 1], { extrapolateRight: "clamp" });
  const settle = interpolate(progress, [0.7, 1], [0, 1], { extrapolateLeft: "clamp" });
  const ang = orbitP * Math.PI * 2 * turns - Math.PI / 2;
  const r = radius * (1 - settle);

  const restA: [number, number] = [cx - restGap, cy];
  const restB: [number, number] = [cx + restGap, cy];

  const ax = interpolate(settle, [0, 1], [cx + Math.cos(ang) * r, restA[0]]);
  const ay = interpolate(settle, [0, 1], [cy + Math.sin(ang) * r, restA[1]]);
  const bx = interpolate(settle, [0, 1], [cx + Math.cos(ang + Math.PI) * r, restB[0]]);
  const by = interpolate(settle, [0, 1], [cy + Math.sin(ang + Math.PI) * r, restB[1]]);

  return (
    <>
      <div style={dotStyle(ax, ay, dot, theme.danger)} />
      <div style={dotStyle(bx, by, dot, theme.success)} />
    </>
  );
};

const dotStyle = (x: number, y: number, d: number, c: string): React.CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width: d,
  height: d,
  borderRadius: 999,
  background: c,
  transform: "translate(-50%,-50%)",
  boxShadow: `0 0 0 6px ${c === theme.danger ? "rgba(220,38,38,0.14)" : "rgba(22,163,74,0.14)"}`,
});
