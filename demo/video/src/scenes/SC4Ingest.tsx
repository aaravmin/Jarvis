import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { theme, font } from "../theme";
import { IngestFunnel } from "../components/IngestFunnel";
import { ChapterChip } from "../components/ChapterChip";
import { LowerThird } from "../components/LowerThird";

const Heading: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [8, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame, [8, 24], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 150,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: o,
        transform: `translateY(${y}px)`,
        fontFamily: font.sans,
      }}
    >
      <div style={{ fontSize: 46, fontWeight: 800, color: theme.foreground, letterSpacing: -0.6 }}>
        Then Jarvis reads it all
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: theme.muted, marginTop: 8 }}>
        One pass across every source, into one place
      </div>
    </div>
  );
};

/** SC4 1200-1660 (460f): Ingest funnel (signature). */
export const SC4Ingest: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <Heading />
      <IngestFunnel durationInFrames={durationInFrames} />

      <ChapterChip index="02" title="Ingest" durationInFrames={durationInFrames} />

      <Sequence from={70} durationInFrames={durationInFrames - 70}>
        <LowerThird
          text="Jarvis reads what you already have"
          sub="Read-only. Nothing is sent."
          durationInFrames={durationInFrames - 70}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
