import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "../components/BrowserFrame";
import { Footage } from "../components/Footage";
import { ChapterChip } from "../components/ChapterChip";
import { LowerThird } from "../components/LowerThird";
import { FRAME } from "../layout";

/** SC5 (140f): Review queue. Real footage (source modal -> check -> bulk accept) + captions. */
export const SC5Review: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url="review"
          sceneDuration={durationInFrames}
          zoom={{ from: 1.02, to: 1.06 }}
          pan={{ x: 0, y: -0.3 }}
          panEase={0.85}
        >
          {/* Opens R1's source quote, checks R1 + R3, bulk-accepts. */}
          <Footage id="review" label="Review" page="review" variant="review" showFrames={durationInFrames} trimStart={90} playbackRate={2.2} />
        </BrowserFrame>
      </div>

      <ChapterChip index="03" title="Review" durationInFrames={durationInFrames} />

      <Sequence from={6} durationInFrames={46}>
        <LowerThird text="Every suggestion cites its source" durationInFrames={46} />
      </Sequence>
      <Sequence from={52} durationInFrames={44}>
        <LowerThird text="Approve or dismiss, your call" durationInFrames={44} />
      </Sequence>
      <Sequence from={96} durationInFrames={durationInFrames - 96}>
        <LowerThird
          text="Bulk accept takes the item and its goal tag"
          sub="Nothing is auto-accepted."
          accent="green"
          durationInFrames={durationInFrames - 96}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
