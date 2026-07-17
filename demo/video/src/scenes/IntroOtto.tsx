import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { Wordmark } from "../components/Wordmark";

/**
 * The open (SC1). Establishes the PRODUCT first: the word "Otto" (text only, no logo) forms, then a
 * one-line promise rises. Warm Fraunces wordmark + Figtree tagline. This is deliberately Otto, not the
 * Brown Bee mark - the tool leads; the example business is introduced in the next scene.
 */
export const IntroOtto: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sub = spring({ frame: frame - 26, fps, config: { damping: 200, mass: 0.7, stiffness: 140 } });
  const subY = interpolate(sub, [0, 1], [16, 0]);

  // A gentle fade up from the canvas at the very start so it never hard-cuts in.
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  void durationInFrames;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fadeIn }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Wordmark size={178} delay={2} weight={600} color={theme.caramel} />

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
          Everything you owe, tied to what matters.
        </div>
      </div>
    </AbsoluteFill>
  );
};
