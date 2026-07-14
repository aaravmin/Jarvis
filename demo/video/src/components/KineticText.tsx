import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";

export type Word = {
  t: string;
  color?: "ink" | "red" | "green" | "muted";
  underline?: boolean;
  bold?: boolean;
};

type Props = {
  lines: Word[][];
  durationInFrames: number;
  fontSize?: number;
  lineGap?: number;
  align?: "left" | "center";
  startDelay?: number;
  stagger?: number;
  weight?: number;
};

const colorOf = (c?: Word["color"]) =>
  c === "red"
    ? theme.danger
    : c === "green"
    ? theme.success
    : c === "muted"
    ? theme.muted
    : theme.foreground;

/**
 * Full-screen kinetic type. Words stagger in with a spring y-offset; keyword
 * words can carry a red/green color and an underline that wipes in after settle.
 */
export const KineticText: React.FC<Props> = ({
  lines,
  durationInFrames,
  fontSize = 64,
  lineGap = 14,
  align = "center",
  startDelay = 4,
  stagger = 3,
  weight = 700,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const exitStart = durationInFrames - 14;
  const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let wordIndex = 0;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        justifyContent: "center",
        gap: lineGap,
        padding: align === "center" ? "0 120px" : "0 160px",
        opacity: exit,
        fontFamily: font.sans,
      }}
    >
      {lines.map((line, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: `0 ${fontSize * 0.28}px`,
            justifyContent: align === "center" ? "center" : "flex-start",
          }}
        >
          {line.map((w, wi) => {
            const idx = wordIndex++;
            const delay = startDelay + idx * stagger;
            const s = spring({
              frame: frame - delay,
              fps,
              config: { damping: 200, mass: 0.7, stiffness: 130 },
            });
            const y = interpolate(s, [0, 1], [26, 0]);
            const underlineWipe = interpolate(
              frame,
              [delay + 8, delay + 22],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 2) }
            );
            return (
              <span
                key={wi}
                style={{
                  position: "relative",
                  display: "inline-block",
                  transform: `translateY(${y}px)`,
                  opacity: s,
                  color: colorOf(w.color),
                  fontSize,
                  fontWeight: w.bold ? 800 : weight,
                  letterSpacing: -0.5,
                  lineHeight: 1.1,
                }}
              >
                {w.t}
                {w.underline ? (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: -Math.round(fontSize * 0.12),
                      height: Math.max(3, Math.round(fontSize * 0.06)),
                      borderRadius: 999,
                      background: colorOf(w.color),
                      transform: `scaleX(${underlineWipe})`,
                      transformOrigin: "left center",
                    }}
                  />
                ) : null}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};
