import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font, shadow } from "../theme";

type Props = {
  text: string;
  sub?: string;
  durationInFrames: number;
  accent?: "ink" | "red" | "green";
};

/**
 * Bottom-left caption bar. Slides up + fades in, holds, fades out.
 * Ink background, white text. One accent dot when the line carries a status.
 */
export const LowerThird: React.FC<Props> = ({ text, sub, durationInFrames, accent = "ink" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rise = spring({
    frame,
    fps,
    config: { damping: 200, mass: 0.8, stiffness: 110 },
  });
  const y = interpolate(rise, [0, 1], [40, 0]);

  const exitStart = durationInFrames - 14;
  const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const dot = accent === "red" ? theme.danger : accent === "green" ? theme.success : null;

  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        bottom: 72,
        transform: `translateY(${y}px)`,
        opacity: Math.min(rise, exit),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 24px",
          borderRadius: 14,
          background: theme.inkStrong,
          boxShadow: shadow.float,
          maxWidth: 900,
        }}
      >
        {dot ? (
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: 999,
              background: dot,
              flexShrink: 0,
              boxShadow: `0 0 0 4px ${accent === "red" ? "rgba(220,38,38,0.2)" : "rgba(22,163,74,0.2)"}`,
            }}
          />
        ) : (
          <span
            style={{
              width: 4,
              height: 26,
              borderRadius: 4,
              background: "rgba(255,255,255,0.32)",
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div
            style={{
              color: "#ffffff",
              fontFamily: font.sans,
              fontSize: 25,
              fontWeight: 600,
              letterSpacing: 0.1,
              lineHeight: 1.2,
            }}
          >
            {text}
          </div>
          {sub ? (
            <div
              style={{
                color: "rgba(255,255,255,0.66)",
                fontFamily: font.sans,
                fontSize: 16.5,
                fontWeight: 500,
                letterSpacing: 0.2,
              }}
            >
              {sub}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
