import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { Wordmark, TwinDots } from "../components/Wordmark";

/** SC9 5250-5940 (690f): outro. Wordmark returns, tagline, sub, fade to white. */
export const SC9Outro: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tag = spring({ frame: frame - 44, fps, config: { damping: 200, mass: 0.9, stiffness: 110 } });
  const tagY = interpolate(tag, [0, 1], [16, 0]);

  const sub = spring({ frame: frame - 74, fps, config: { damping: 200, mass: 0.9, stiffness: 110 } });
  const subY = interpolate(sub, [0, 1], [14, 0]);

  const dotsProgress = interpolate(frame, [74, 156], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // fade to white at the very end
  const white = interpolate(frame, [durationInFrames - 60, durationInFrames - 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t * t,
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Wordmark size={140} delay={6} />

          <div
            style={{
              marginTop: 32,
              transform: `translateY(${tagY}px)`,
              opacity: tag,
              display: "inline-flex",
              alignItems: "center",
              fontFamily: font.sans,
              fontSize: 38,
              fontWeight: 500,
              letterSpacing: 0.3,
              color: theme.muted,
            }}
          >
            <span>Attention, in order</span>
            <span style={{ position: "relative", width: 52, height: 38, marginLeft: 12 }}>
              <TwinDots cx={25} cy={25} radius={19} dot={12} turns={1} progress={dotsProgress} restGap={8} />
            </span>
          </div>

          <div
            style={{
              marginTop: 20,
              transform: `translateY(${subY}px)`,
              opacity: sub,
              fontFamily: font.sans,
              fontSize: 22,
              fontWeight: 500,
              color: theme.borderStrong,
            }}
          >
            Jarvis, a goal-grounded attention engine
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "#ffffff", opacity: white }} />
    </AbsoluteFill>
  );
};
