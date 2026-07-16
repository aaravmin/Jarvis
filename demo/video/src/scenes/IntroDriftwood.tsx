import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";

/**
 * The open. A clean, brief title card introducing the business - "Driftwood Roasters", a
 * small-batch coffee roastery - then we go straight into the app. Text only: no brand graphic,
 * no attention motif, no red/green dots. Calm fade-up with a hairline rule.
 */
export const IntroDriftwood: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kicker = interpolate(frame, [4, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const title = spring({ frame: frame - 10, fps, config: { damping: 200, mass: 0.8, stiffness: 90 } });
  const titleY = interpolate(title, [0, 1], [26, 0]);

  const rule = spring({ frame: frame - 26, fps, config: { damping: 200, mass: 0.7, stiffness: 120 } });

  const sub = spring({ frame: frame - 34, fps, config: { damping: 200, mass: 0.7, stiffness: 130 } });
  const subY = interpolate(sub, [0, 1], [16, 0]);

  // hold, then a gentle settle out (SceneWrap also crossfades into the app)
  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: exit }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div
          style={{
            opacity: kicker,
            fontFamily: font.sans,
            fontSize: 23,
            fontWeight: 700,
            letterSpacing: 4.8,
            textTransform: "uppercase",
            color: theme.caramel,
          }}
        >
          Small-batch coffee roastery
        </div>

        <div
          style={{
            marginTop: 28,
            transform: `translateY(${titleY}px)`,
            opacity: title,
            fontFamily: font.serif,
            fontSize: 132,
            fontWeight: 600,
            fontOpticalSizing: "auto",
            letterSpacing: -2,
            lineHeight: 1.0,
            color: theme.foreground,
          }}
        >
          Driftwood Roasters
        </div>

        <div
          style={{
            marginTop: 32,
            width: 360 * rule,
            height: 3,
            borderRadius: 3,
            background: theme.caramel,
            opacity: rule,
          }}
        />

        <div
          style={{
            marginTop: 26,
            transform: `translateY(${subY}px)`,
            opacity: sub,
            fontFamily: font.sans,
            fontSize: 31,
            fontWeight: 500,
            letterSpacing: 0.3,
            color: theme.muted,
          }}
        >
          Providence, Rhode Island
        </div>
      </div>
    </AbsoluteFill>
  );
};
