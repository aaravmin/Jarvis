import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font, shadow } from "../theme";

type Props = {
  index: string; // "01"
  title: string; // "Goals"
  durationInFrames: number;
};

/** Top-left persistent chapter marker: small pill "01 - Goals". */
export const ChapterChip: React.FC<Props> = ({ index, title, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.7, stiffness: 120 } });
  const x = interpolate(enter, [0, 1], [-30, 0]);

  const exitStart = durationInFrames - 12;
  const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        top: 54,
        transform: `translateX(${x}px)`,
        opacity: Math.min(enter, exit),
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 16px 9px 12px",
        borderRadius: 999,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        boxShadow: shadow.card,
        fontFamily: font.sans,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.4,
          color: "#fff",
          background: theme.accentStrong,
          borderRadius: 999,
          padding: "3px 9px",
        }}
      >
        {index}
      </span>
      <span style={{ fontSize: 15.5, fontWeight: 600, color: theme.foreground, letterSpacing: 0.3 }}>
        {title}
      </span>
    </div>
  );
};
