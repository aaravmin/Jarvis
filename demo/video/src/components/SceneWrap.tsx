import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

/**
 * Standard scene entrance/exit. Content dissolves in from the shared canvas and
 * back out to it, with an optional gentle scale so cuts feel like breaths rather
 * than hard flashes. Timing is scene-relative (each scene is its own Sequence).
 */
export const SceneWrap: React.FC<{
  durationInFrames: number;
  fadeIn?: number;
  fadeOut?: number;
  scaleIn?: boolean;
  children: React.ReactNode;
}> = ({ durationInFrames, fadeIn = 14, fadeOut = 12, scaleIn = false, children }) => {
  const frame = useCurrentFrame();

  const fadeInOpacity =
    fadeIn > 0
      ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;
  const fadeOutOpacity =
    fadeOut > 0
      ? interpolate(frame, [durationInFrames - fadeOut, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;
  const opacity = Math.min(fadeInOpacity, fadeOutOpacity);

  const scale =
    scaleIn && fadeIn > 0
      ? interpolate(frame, [0, fadeIn], [1.015, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
      : 1;

  return <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
};
