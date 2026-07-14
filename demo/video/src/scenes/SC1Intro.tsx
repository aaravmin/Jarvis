import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { Wordmark, TwinDots } from "../components/Wordmark";

/** SC1 0-240: white sweep reveal, wordmark spring-in, tagline, twin dots orbit + settle. */
export const SC1Intro: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // white sweep reveals the canvas (diagonal wipe off to the right)
  const sweep = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  // tagline
  const tag = spring({ frame: frame - 60, fps, config: { damping: 200, mass: 0.9, stiffness: 110 } });
  const tagY = interpolate(tag, [0, 1], [18, 0]);

  // twin dots orbit + settle, timed after tagline, landing as the tagline period
  const dotsProgress = interpolate(frame, [92, 172], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const exit = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Wordmark size={150} delay={10} />
          </div>

          <div
            style={{
              marginTop: 34,
              transform: `translateY(${tagY}px)`,
              opacity: tag,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: font.sans,
                fontSize: 40,
                fontWeight: 500,
                letterSpacing: 0.3,
                color: theme.muted,
              }}
            >
              Attention, in order
            </span>
            {/* twin dots settle inline as the tagline's period */}
            <span style={{ position: "relative", width: 54, height: 40, marginLeft: 12 }}>
              <TwinDots cx={26} cy={26} radius={20} dot={13} turns={1} progress={dotsProgress} restGap={8} />
            </span>
          </div>
        </div>
      </AbsoluteFill>

      {/* white sweep panel */}
      <AbsoluteFill
        style={{
          background: "#ffffff",
          transform: `translateX(${sweep * 100}%) skewX(-8deg)`,
          transformOrigin: "left center",
          opacity: sweep < 1 ? 1 : 0,
        }}
      />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sweep * 100}%`,
            width: 6,
            background: theme.accentStrong,
            opacity: sweep < 1 ? 0.5 : 0,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
