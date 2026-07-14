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
  const exit = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: exit }}>
      <div style={{ display: "flex", gap: 26 }}>
        {CHIPS.map((c, i) => {
          const s = spring({ frame: frame - 6 - i * 7, fps, config: { damping: 200, mass: 0.9, stiffness: 110 } });
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

/** SC2 240-660 (420f): premise, four kinetic beats. */
export const SC2Premise: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={112}>
        <KineticText
          durationInFrames={112}
          lines={[[{ t: "Meet" }, { t: "Driftwood" }, { t: "Roasters." }]]}
          fontSize={82}
        />
      </Sequence>

      <Sequence from={112} durationInFrames={104}>
        <KineticText
          durationInFrames={104}
          lines={[[{ t: "A" }, { t: "six-person" }, { t: "coffee" }, { t: "roastery." }]]}
          fontSize={70}
        />
      </Sequence>

      <Sequence from={216} durationInFrames={104}>
        <SourceChips durationInFrames={104} />
      </Sequence>

      <Sequence from={320} durationInFrames={durationInFrames - 320}>
        <KineticText
          durationInFrames={durationInFrames - 320}
          lines={[
            [{ t: "Too", color: "muted" }, { t: "much", color: "muted" }, { t: "inbox.", color: "muted" }],
            [{ t: "What" }, { t: "actually" }, { t: "matters", underline: true, color: "ink" }, { t: "today?", underline: true, color: "ink" }],
          ]}
          fontSize={66}
          lineGap={22}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
