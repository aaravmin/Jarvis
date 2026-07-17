import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme, font } from "../theme";

/**
 * A subtle, persistent corner watermark shown ONLY over the app footage: "Example . Brown Bee Coffee".
 * It makes unmistakable that Otto is the product and Brown Bee Coffee is just the sample dataset, even
 * for a viewer who lands mid-video. Low-opacity, small, bottom-right (clear of the bottom-left caption),
 * and OUTSIDE the browser frame's zoom so it stays put while the footage moves. A tiny marigold dot ties
 * it to the Brown Bee mark without ever competing with the red/green status colors.
 */
export const ExampleTag: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  // Ease in over the first ~10 frames, out over the last ~10, so it never pops on a hard cut.
  const inO = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const outO = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(inO, outO) * 0.62;

  return (
    <div
      style={{
        position: "absolute",
        right: 60,
        bottom: 84,
        opacity,
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 15px",
        borderRadius: 999,
        background: "rgba(17,24,39,0.60)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(2px)",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: theme.beeAmber,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: font.sans,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: 0.4,
          color: "rgba(255,255,255,0.86)",
        }}
      >
        Example
        <span style={{ color: "rgba(255,255,255,0.42)", margin: "0 8px" }}>·</span>
        <span style={{ color: "rgba(255,255,255,0.72)", fontWeight: 500 }}>Brown Bee Coffee</span>
      </span>
    </div>
  );
};
