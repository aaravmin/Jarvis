import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { Wordmark } from "../components/Wordmark";

/**
 * The close (SC7). Just the word "Otto" (homey Baloo 2 wordmark, no logo) with a concrete one-line
 * promise that echoes the open. Settles to white. Text only - no "example shown" footnote (the sample is
 * already made clear by the persistent corner tag over the app scenes).
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
          <Wordmark size={176} delay={4} weight={700} color={theme.caramel} />

          <div
            style={{
              marginTop: 30,
              transform: `translateY(${subY}px)`,
              opacity: sub,
              fontFamily: font.sans,
              fontSize: 27,
              fontWeight: 500,
              letterSpacing: 0.3,
              color: theme.muted,
            }}
          >
            What to do next, ranked by your goals.
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "#ffffff", opacity: white }} />
    </AbsoluteFill>
  );
};
