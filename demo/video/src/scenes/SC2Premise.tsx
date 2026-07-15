import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font, shadow } from "../theme";
import { KineticText } from "../components/KineticText";

const CHIPS = [
  { label: "Email", from: [-380, -120] as [number, number] },
  { label: "Meetings", from: [-140, 220] as [number, number] },
  { label: "Notion", from: [160, -200] as [number, number] },
  { label: "Calendar", from: [420, 140] as [number, number] },
];

const SourceChips: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = interpolate(frame, [durationInFrames - 8, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: exit }}>
      <div style={{ display: "flex", gap: 26 }}>
        {CHIPS.map((c, i) => {
          const s = spring({ frame: frame - 3 - i * 8, fps, config: { damping: 200, mass: 0.6, stiffness: 165 } });
          const x = interpolate(s, [0, 1], [c.from[0], 0]);
          const y = interpolate(s, [0, 1], [c.from[1], 0]);
          return (
            <div
              key={c.label}
              style={{
                transform: `translate(${x}px, ${y}px) scale(${interpolate(s, [0, 1], [0.7, 1])})`,
                opacity: s,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "18px 28px",
                borderRadius: 16,
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                boxShadow: shadow.card,
                fontFamily: font.sans,
                fontSize: 26,
                fontWeight: 600,
                color: theme.foreground,
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 5, background: theme.accentSoft, border: `1px solid ${theme.borderStrong}` }} />
              {c.label}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** SC2 (186f): premise, rapid kinetic beats (each line pops <= ~34f then cuts). */
export const SC2Premise: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={30}>
        <KineticText
          durationInFrames={30}
          lines={[[{ t: "Meet" }, { t: "Driftwood" }, { t: "Roasters." }]]}
          fontSize={82}
        />
      </Sequence>

      <Sequence from={30} durationInFrames={26}>
        <KineticText
          durationInFrames={26}
          lines={[[{ t: "A" }, { t: "six-person" }, { t: "coffee" }, { t: "roastery." }]]}
          fontSize={70}
        />
      </Sequence>

      <Sequence from={56} durationInFrames={42}>
        <SourceChips durationInFrames={42} />
      </Sequence>

      <Sequence from={98} durationInFrames={24}>
        <KineticText
          durationInFrames={24}
          lines={[[{ t: "Too", color: "muted" }, { t: "much", color: "muted" }, { t: "inbox.", color: "muted" }]]}
          fontSize={72}
        />
      </Sequence>

      <Sequence from={122} durationInFrames={durationInFrames - 122}>
        <KineticText
          durationInFrames={durationInFrames - 122}
          lines={[
            [{ t: "What" }, { t: "actually" }, { t: "matters", underline: true, color: "ink" }, { t: "today?", underline: true, color: "ink" }],
          ]}
          fontSize={72}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
