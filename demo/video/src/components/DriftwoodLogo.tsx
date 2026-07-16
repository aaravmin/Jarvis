import React from "react";
import { theme } from "../theme";

/**
 * Driftwood Roasters emblem - ORIGINAL artwork for this fictional demo business (no real coffee brand
 * is referenced). The mark reads as a small-batch roastery on the coast:
 *   - a roaster-drum HOOP (the outer caramel ring),
 *   - a warm ROAST SUN with a few heat strokes rising (coffee warmth),
 *   - a floating DRIFTWOOD PLANK,
 *   - the WAVES it rides on.
 * Every layer takes its own 0..1 progress so the title scene can stagger them in (ring draws, sun pops,
 * plank settles, waves draw, heat rises). Palette is the brand caramel + ink only.
 */
export const DriftwoodLogo: React.FC<{
  size?: number;
  ring?: number; // outer drum hoop draw-on
  sun?: number; // roast sun pop-in
  plank?: number; // driftwood plank settle-in
  waves?: number; // waves draw-on
  heat?: number; // heat/steam strokes rise
  caramel?: string;
  ink?: string;
}> = ({
  size = 160,
  ring = 1,
  sun = 1,
  plank = 1,
  waves = 1,
  heat = 1,
  caramel = theme.caramel,
  ink = theme.inkStrong,
}) => {
  const R = 86; // hoop radius
  const sunScale = 0.35 + 0.65 * sun;
  const plankDrop = (1 - plank) * 20;
  const heatRise = (1 - heat) * 14;

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-label="Driftwood Roasters">
      <defs>
        <clipPath id="dw_hoop_clip">
          <circle cx="100" cy="100" r={R - 8} />
        </clipPath>
      </defs>

      {/* faint warm halo */}
      <circle cx="100" cy="100" r="94" fill={caramel} opacity={0.05 * ring} />

      {/* the sea + driftwood, clipped inside the hoop */}
      <g clipPath="url(#dw_hoop_clip)">
        {/* waves (sea grain) - draw on left -> right */}
        <path
          d="M18 132 C40 122, 60 142, 82 132 S126 122, 148 132 S184 142, 196 132"
          stroke={caramel}
          strokeWidth={4.5}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - waves}
        />
        <path
          d="M12 148 C36 139, 58 158, 82 148 S128 139, 152 148 S190 158, 204 148"
          stroke={ink}
          strokeOpacity={0.42}
          strokeWidth={3.5}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - Math.max(0, waves * 1.1 - 0.1)}
        />

        {/* driftwood plank riding the top wave */}
        <g transform={`translate(0 ${plankDrop})`} opacity={plank}>
          <g transform="rotate(-7 100 112)">
            <rect x="58" y="105" width="84" height="13" rx="6.5" fill={ink} />
            {/* warm top-edge highlight = weathered grain */}
            <rect x="64" y="107.5" width="60" height="2.4" rx="1.2" fill={caramel} opacity={0.85} />
          </g>
        </g>
      </g>

      {/* roast sun + rising heat, above the plank */}
      <g opacity={sun}>
        <g transform={`translate(100 78) scale(${sunScale}) translate(-100 -78)`}>
          <circle cx="100" cy="78" r="19" fill={caramel} />
          <circle cx="100" cy="78" r="19" fill="#ffffff" opacity={0.12} />
        </g>
        {/* three short heat/steam strokes rising off the sun */}
        <g opacity={heat} transform={`translate(0 ${heatRise})`} stroke={caramel} strokeWidth={3} strokeLinecap="round">
          <path d="M100 50 q4 -7 0 -14" opacity={0.9} />
          <path d="M84 54 q3.5 -6 0 -12" opacity={0.7} />
          <path d="M116 54 q3.5 -6 0 -12" opacity={0.7} />
        </g>
      </g>

      {/* roaster-drum hoop, drawn on from the top */}
      <circle
        cx="100"
        cy="100"
        r={R}
        stroke={caramel}
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - ring}
        transform="rotate(-90 100 100)"
      />
      {/* inner hairline for depth */}
      <circle cx="100" cy="100" r={R - 9} stroke={ink} strokeOpacity={0.1 * ring} strokeWidth={1.5} />
    </svg>
  );
};
