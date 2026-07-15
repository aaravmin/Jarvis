import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "../components/BrowserFrame";
import { Footage } from "../components/Footage";
import { ChapterChip } from "../components/ChapterChip";
import { LowerThird } from "../components/LowerThird";
import { FRAME } from "../layout";

/** SC3 (140f): Goals. Real goals-create footage (typing a goal) + rapid captions. */
export const SC3Goals: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url="goals"
          sceneDuration={durationInFrames}
          zoom={{ from: 1.02, to: 1.06 }}
          pan={{ x: 0, y: -0.4 }}
          panEase={0.9}
        >
          {/* Types "Win a national roasting award" then adds it. */}
          <Footage id="goals-create" label="Goals" page="goals" variant="goals" showFrames={durationInFrames} trimStart={0} playbackRate={1.6} />
        </BrowserFrame>
      </div>

      <ChapterChip index="01" title="Goals" durationInFrames={durationInFrames} />

      {/* Rapid captions; the live typing carries the motion underneath. */}
      <Sequence from={6} durationInFrames={46}>
        <LowerThird text="Start with goals, not tasks" durationInFrames={46} />
      </Sequence>
      <Sequence from={52} durationInFrames={44}>
        <LowerThird text="Just type it, in plain words" durationInFrames={44} />
      </Sequence>
      <Sequence from={96} durationInFrames={durationInFrames - 96}>
        <LowerThird
          text="Sub-goals are your definition of important"
          sub="This is what GOTT plans around."
          durationInFrames={durationInFrames - 96}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
