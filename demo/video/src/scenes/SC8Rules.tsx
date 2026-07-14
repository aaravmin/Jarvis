import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme, font } from "../theme";
import { RuleCards } from "../components/RuleCards";
import { ChapterChip } from "../components/ChapterChip";

const Heading: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [6, 22], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 118,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: o,
        transform: `translateY(${y}px)`,
        fontFamily: font.sans,
      }}
    >
      <div style={{ fontSize: 48, fontWeight: 800, color: theme.foreground, letterSpacing: -0.6 }}>
        Trust, by construction
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: theme.muted, marginTop: 8 }}>
        Four rules Jarvis never breaks
      </div>
    </div>
  );
};

/** SC8 4700-5250 (550f): the four principles, 3D-flip cards. */
export const SC8Rules: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <Heading />
      <RuleCards durationInFrames={durationInFrames} />
      <ChapterChip index="06" title="Principles" durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};
