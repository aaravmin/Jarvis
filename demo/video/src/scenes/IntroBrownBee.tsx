import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { BrownBeeLogo } from "../components/BrownBeeLogo";
import { clamp01, easeOutBack, easeOutCubic } from "../motion";

/**
 * The open. The ORIGINAL Brown Bee Coffee emblem assembles itself - the marigold honeycomb-cell
 * hexagon scales + fades in, then the small dark-brown dot pops - and the "BROWN BEE COFFEE" wordmark
 * rises in a refined, letter-spaced Fraunces serif (warm medium brown) with a marigold rule and a
 * small-caps roastery line. Text + mark only; the Brown Bee amber/brown palette.
 */
export const IntroBrownBee: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // emblem assembly: the hexagon draws in, then the brown dot pops a beat later.
  const hex = easeOutCubic((frame - 2) / 20);
  const dot = Math.min(1.05, easeOutBack((frame - 16) / 16));
  const logoSettle = spring({ frame: frame - 2, fps, config: { damping: 200, mass: 0.9, stiffness: 80 } });
  const logoScale = interpolate(logoSettle, [0, 1], [0.92, 1]);

  // wordmark rise (masked), a calm reveal
  const word = spring({ frame: frame - 27, fps, config: { damping: 200, mass: 0.8, stiffness: 90 } });
  const wordY = interpolate(word, [0, 1], [1.0, 0]); // in em, revealed from a clip

  const rule = easeOutCubic((frame - 38) / 16);
  const kicker = clamp01((frame - 44) / 16);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ transform: `scale(${logoScale})`, opacity: clamp01(hex + 0.15) }}>
          <BrownBeeLogo size={176} hex={clamp01(hex)} dot={clamp01(dot)} />
        </div>

        <div style={{ marginTop: 34, overflow: "hidden", paddingBottom: 8 }}>
          <div
            style={{
              transform: `translateY(${wordY}em)`,
              opacity: clamp01(word * 1.3),
              fontFamily: font.serif,
              fontSize: 74,
              fontWeight: 600,
              fontOpticalSizing: "auto",
              letterSpacing: 9,
              lineHeight: 1.0,
              color: theme.beeBrown,
              paddingLeft: 9, // balance the trailing letter-spacing so it reads centered
            }}
          >
            BROWN BEE COFFEE
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            width: 268 * rule,
            height: 4,
            borderRadius: 4,
            background: theme.beeAmber,
            opacity: rule,
          }}
        />

        <div
          style={{
            marginTop: 22,
            opacity: kicker,
            fontFamily: font.sans,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 4.2,
            textTransform: "uppercase",
            color: theme.beeBrown,
          }}
        >
          Small-batch coffee roastery
          <span style={{ color: theme.muted, margin: "0 12px" }}>·</span>
          <span style={{ color: theme.muted, fontWeight: 600 }}>Providence, Rhode Island</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
