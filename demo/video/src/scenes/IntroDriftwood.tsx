import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";
import { DriftwoodLogo } from "../components/DriftwoodLogo";
import { clamp01, easeOutBack, easeOutCubic, smoother } from "../motion";

/**
 * The open. The ORIGINAL Driftwood Roasters emblem assembles itself - the roaster-drum hoop draws on,
 * the roast sun pops, the driftwood plank settles onto its waves - then the wordmark rises in Fraunces
 * with a caramel rule and a small-caps line. Text + mark only; caramel + ink palette.
 */
export const IntroDriftwood: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // emblem assembly
  const ring = easeOutCubic((frame - 2) / 20);
  const sun = Math.min(1.04, easeOutBack((frame - 9) / 16));
  const plank = smoother((frame - 15) / 16);
  const waves = easeOutCubic((frame - 17) / 22);
  const heat = smoother((frame - 22) / 18);
  const logoSettle = spring({ frame: frame - 2, fps, config: { damping: 200, mass: 0.9, stiffness: 80 } });
  const logoScale = interpolate(logoSettle, [0, 1], [0.9, 1]);

  // wordmark rise (masked)
  const word = spring({ frame: frame - 27, fps, config: { damping: 200, mass: 0.8, stiffness: 90 } });
  const wordY = interpolate(word, [0, 1], [1.0, 0]); // in em, revealed from a clip

  const rule = easeOutCubic((frame - 36) / 16);
  const kicker = clamp01((frame - 42) / 16);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ transform: `scale(${logoScale})`, opacity: clamp01(ring + 0.15) }}>
          <DriftwoodLogo size={168} ring={clamp01(ring)} sun={clamp01(sun)} plank={clamp01(plank)} waves={clamp01(waves)} heat={clamp01(heat)} />
        </div>

        <div style={{ marginTop: 30, overflow: "hidden", paddingBottom: 6 }}>
          <div
            style={{
              transform: `translateY(${wordY}em)`,
              opacity: clamp01(word * 1.3),
              fontFamily: font.serif,
              fontSize: 118,
              fontWeight: 600,
              fontOpticalSizing: "auto",
              letterSpacing: -2,
              lineHeight: 1.0,
              color: theme.foreground,
            }}
          >
            Driftwood Roasters
          </div>
        </div>

        <div
          style={{
            marginTop: 26,
            width: 300 * rule,
            height: 3,
            borderRadius: 3,
            background: theme.caramel,
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
            color: theme.caramel,
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
