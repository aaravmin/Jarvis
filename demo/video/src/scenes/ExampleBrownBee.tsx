import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { BrownBeeLogo } from "../components/BrownBeeLogo";
import { clamp01, easeOutBack, easeOutCubic } from "../motion";

/**
 * The setup (SC2). Names the EXAMPLE, not the product: a small "AN EXAMPLE" eyebrow over the Brown Bee
 * Coffee mark makes it unmistakable that Brown Bee is a sample business Otto is being shown on. The mark
 * appears here (small, labeled), never as the hero. Then the problem Otto solves: her commitments are
 * scattered across email, meetings, and Notion.
 */
export const ExampleBrownBee: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const eyebrow = clamp01((frame - 4) / 14);

  // the small Brown Bee mark assembles: hexagon draws in, the brown dot pops a beat later
  const hex = easeOutCubic((frame - 12) / 20);
  const dot = Math.min(1.05, easeOutBack((frame - 26) / 16));

  const name = spring({ frame: frame - 34, fps, config: { damping: 200, mass: 0.8, stiffness: 95 } });
  const nameY = interpolate(name, [0, 1], [18, 0]);

  const sub = spring({ frame: frame - 52, fps, config: { damping: 200, mass: 0.8, stiffness: 120 } });
  const subY = interpolate(sub, [0, 1], [16, 0]);

  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: fadeOut }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div
          style={{
            opacity: eyebrow,
            transform: `translateY(${interpolate(eyebrow, [0, 1], [8, 0])}px)`,
            fontFamily: font.sans,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: theme.caramel,
            marginBottom: 26,
          }}
        >
          An example
        </div>

        <BrownBeeLogo size={116} hex={clamp01(hex)} dot={clamp01(dot)} />

        <div
          style={{
            marginTop: 26,
            transform: `translateY(${nameY}px)`,
            opacity: name,
            fontFamily: font.serif,
            fontSize: 52,
            fontWeight: 600,
            fontOpticalSizing: "auto",
            letterSpacing: 0.2,
            color: theme.beeBrown,
          }}
        >
          Maya runs Brown Bee Coffee.
        </div>

        <div
          style={{
            marginTop: 22,
            transform: `translateY(${subY}px)`,
            opacity: sub,
            fontFamily: font.sans,
            fontSize: 25,
            fontWeight: 500,
            letterSpacing: 0.2,
            lineHeight: 1.4,
            color: theme.muted,
            maxWidth: 900,
          }}
        >
          Her commitments live across email, meetings, and Notion. Scattered.
        </div>
      </div>
    </AbsoluteFill>
  );
};
