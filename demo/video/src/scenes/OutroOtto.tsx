import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { Wordmark } from "../components/Wordmark";

/**
 * The close (SC7). Just the word "Otto" (text, no logo, no graphic) with the one-line promise it opened
 * on, then a small footnote making clear the whole tour was a sample. Settles to white. Text only.
 */
export const OutroOtto: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sub = spring({ frame: frame - 30, fps, config: { damping: 200, mass: 0.7, stiffness: 140 } });
  const subY = interpolate(sub, [0, 1], [14, 0]);

  const foot = interpolate(frame, [46, 62], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

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
          <Wordmark size={172} delay={4} weight={600} color={theme.caramel} />

          <div
            style={{
              marginTop: 30,
              transform: `translateY(${subY}px)`,
              opacity: sub,
              fontFamily: font.sans,
              fontSize: 25,
              fontWeight: 500,
              letterSpacing: 0.4,
              color: theme.muted,
            }}
          >
            Every commitment, tied to what matters.
          </div>

          <div
            style={{
              marginTop: 40,
              opacity: foot * 0.9,
              fontFamily: font.sans,
              fontSize: 15,
              fontWeight: 500,
              letterSpacing: 0.6,
              color: theme.muted,
            }}
          >
            Example shown: Brown Bee Coffee
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "#ffffff", opacity: white }} />
    </AbsoluteFill>
  );
};
