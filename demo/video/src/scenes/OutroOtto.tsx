import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { Wordmark } from "../components/Wordmark";

/**
 * The close. Just the word "Otto" (text, no logo, no graphic) with a quiet one-line descriptor,
 * settling to white. No twin dots, no attention tagline - a plain, calm sign-off.
 */
export const OutroOtto: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sub = spring({ frame: frame - 30, fps, config: { damping: 200, mass: 0.7, stiffness: 140 } });
  const subY = interpolate(sub, [0, 1], [14, 0]);

  // fade to white at the very end
  const white = interpolate(frame, [durationInFrames - 34, durationInFrames - 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * t,
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Wordmark size={150} delay={4} />

          <div
            style={{
              marginTop: 26,
              transform: `translateY(${subY}px)`,
              opacity: sub,
              fontFamily: font.sans,
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: 0.3,
              color: theme.muted,
            }}
          >
            A goal-grounded attention engine
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "#ffffff", opacity: white }} />
    </AbsoluteFill>
  );
};
