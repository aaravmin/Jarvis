import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "../components/BrowserFrame";
import { Footage } from "../components/Footage";
import { ChapterChip } from "../components/ChapterChip";
import { Callout } from "../components/Callout";
import { FRAME } from "../layout";

/** SC3 660-1200 (540f): Goals. F1 footage + two callouts. */
export const SC3Goals: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url="goals"
          sceneDuration={durationInFrames}
          zoom={{ from: 1.0, to: 1.04 }}
          pan={{ x: 0, y: -0.5 }}
          panEase={0.9}
        >
          <Footage id="F1" label="Goals" page="goals" variant="goals" showFrames={durationInFrames} />
        </BrowserFrame>
      </div>

      <ChapterChip index="01" title="Goals" durationInFrames={durationInFrames} />

      <Sequence from={46} durationInFrames={196}>
        <Callout
          region={{ x: 664, y: 322, w: 792, h: 150 }}
          label="Start with goals, not tasks"
          placement="bottom"
          color="ink"
          durationInFrames={196}
        />
      </Sequence>

      <Sequence from={286} durationInFrames={durationInFrames - 286 - 8}>
        <Callout
          region={{ x: 690, y: 512, w: 690, h: 60 }}
          label="Sub-goals are your definition of important"
          placement="top"
          color="ink"
          durationInFrames={durationInFrames - 286 - 8}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
