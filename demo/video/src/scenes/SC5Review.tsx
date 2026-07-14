import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "../components/BrowserFrame";
import { Footage } from "../components/Footage";
import { ChapterChip } from "../components/ChapterChip";
import { Callout } from "../components/Callout";
import { LowerThird } from "../components/LowerThird";
import { FRAME } from "../layout";

/** SC5 1660-2480 (820f): Review queue. F2 footage + three callouts + lower third. */
export const SC5Review: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url="review"
          sceneDuration={durationInFrames}
          zoom={{ from: 1.0, to: 1.05 }}
          pan={{ x: 0, y: -0.3 }}
          panEase={0.85}
        >
          <Footage id="F2" label="Review" page="review" variant="review" showFrames={durationInFrames} />
        </BrowserFrame>
      </div>

      <ChapterChip index="03" title="Review" durationInFrames={durationInFrames} />

      {/* C1 - source quote */}
      <Sequence from={90} durationInFrames={210}>
        <Callout
          region={{ x: 668, y: 358, w: 230, h: 34 }}
          label="Every suggestion quotes its source"
          placement="bottom"
          color="ink"
          durationInFrames={210}
        />
      </Sequence>

      {/* C2 - goal chip */}
      <Sequence from={330} durationInFrames={210}>
        <Callout
          region={{ x: 668, y: 476, w: 236, h: 34 }}
          label="Goal chips show why it matters"
          placement="bottom"
          color="ink"
          durationInFrames={210}
        />
      </Sequence>

      {/* C3 - bulk accept (positive => green) */}
      <Sequence from={572} durationInFrames={200}>
        <Callout
          region={{ x: 658, y: 244, w: 330, h: 54 }}
          label="One approval takes the item and its goal tag"
          placement="bottom"
          color="green"
          durationInFrames={200}
        />
      </Sequence>

      <Sequence from={600} durationInFrames={durationInFrames - 600}>
        <LowerThird text="Nothing is auto-accepted." durationInFrames={durationInFrames - 600} />
      </Sequence>
    </AbsoluteFill>
  );
};
