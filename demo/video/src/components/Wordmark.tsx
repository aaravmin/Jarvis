import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font } from "../theme";

/**
 * The Otto wordmark: text only, no logo mark - now set in the warm Fraunces serif. Letters stagger
 * up on a spring while the letter-spacing eases from tight to a calm resting track. Used only in the
 * closing card, where it carries the caramel brand accent.
 */
export const Wordmark: React.FC<{ size?: number; delay?: number; color?: string; weight?: number }> = ({
  size = 130,
  delay = 0,
  color = theme.foreground,
  weight = 600,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = "Otto".split("");

  const spread = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 1.1, stiffness: 60 } });
  const tracking = interpolate(spread, [0, 1], [size * 0.008, size * 0.035]);

  return (
    <div style={{ display: "flex", alignItems: "baseline", paddingLeft: tracking }}>
      {letters.map((ch, i) => {
        const s = spring({
          frame: frame - delay - i * 4,
          fps,
          config: { damping: 200, mass: 0.8, stiffness: 120 },
        });
        const y = interpolate(s, [0, 1], [size * 0.28, 0]);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `translateY(${y}px)`,
              opacity: s,
              marginRight: tracking,
              fontFamily: font.serif,
              fontWeight: weight,
              fontOpticalSizing: "auto",
              fontSize: size,
              lineHeight: 1,
              color,
              letterSpacing: 0,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};
