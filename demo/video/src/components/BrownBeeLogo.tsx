import React from "react";
import { theme } from "../theme";

/**
 * Brown Bee Coffee emblem - ORIGINAL artwork recreated for the demo business's OWN mark (ownership
 * confirmed by the user). The mark is a single flat-top honeycomb-cell HEXAGON in marigold/amber
 * (#F4B500) with slightly rounded corners, and one small dark-brown dot (#3D2817) in the upper-right
 * area inside it. The "BROWN BEE COFFEE" wordmark is set separately in the intro scene, below the
 * emblem, so the two can be staggered and revealed independently.
 *
 * Assembly: `hex` (0..1, may overshoot slightly) scales + fades the hexagon in; `dot` (0..1, may
 * overshoot) pops the brown dot in a beat after it. The intro scene staggers the two so the mark
 * assembles itself - tasteful and simple, not busy.
 */
// Precomputed flat-top hexagon (center 100,100, circumradius 76, 13px rounded corners), bbox x 24..176,
// y 34..166 - symmetric about (100,100). Generated once; drawn as a filled path.
const HEX_D =
  "M55.5,45.44 Q62,34.18 75,34.18 L125,34.18 Q138,34.18 144.5,45.44 L169.5,88.74 Q176,100 169.5,111.26 L144.5,154.56 Q138,165.82 125,165.82 L75,165.82 Q62,165.82 55.5,154.56 L30.5,111.26 Q24,100 30.5,88.74 Z";

export const BrownBeeLogo: React.FC<{
  size?: number;
  hex?: number; // hexagon reveal 0..1 (may overshoot slightly for a soft pop)
  dot?: number; // brown dot pop 0..1 (may overshoot)
  amber?: string;
  brownDark?: string;
}> = ({ size = 168, hex = 1, dot = 1, amber = theme.beeAmber, brownDark = theme.beeBrownDark }) => {
  const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
  const hexScale = 0.84 + 0.16 * Math.min(1.02, hex);
  const hexOpacity = clamp01(hex * 1.25 - 0.08);
  const dotScale = Math.max(0, dot);
  const dotOpacity = clamp01(dot * 1.3);

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-label="Brown Bee Coffee">
      <defs>
        <linearGradient id="bb_hex_fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8C63C" />
          <stop offset="0.55" stopColor={amber} />
          <stop offset="1" stopColor="#EAA800" />
        </linearGradient>
      </defs>

      {/* faint amber halo */}
      <circle cx="100" cy="100" r="93" fill={amber} opacity={0.06 * hexOpacity} />

      {/* the honeycomb-cell hexagon: scales + fades in */}
      <g transform={`translate(100 100) scale(${hexScale}) translate(-100 -100)`} opacity={hexOpacity}>
        <path d={HEX_D} fill="url(#bb_hex_fill)" />
        {/* a hair of inner definition so the amber has some depth */}
        <path d={HEX_D} fill="none" stroke="#EAA800" strokeOpacity={0.35} strokeWidth={1.5} />

        {/* the dark-brown dot in the upper-right, popping in a beat later */}
        <g transform={`translate(135 73) scale(${dotScale}) translate(-135 -73)`} opacity={dotOpacity}>
          <circle cx="135" cy="73" r="11.5" fill={brownDark} />
        </g>
      </g>
    </svg>
  );
};
