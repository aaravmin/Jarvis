import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "../components/BrowserFrame";
import { Footage } from "../components/Footage";
import { ChapterChip } from "../components/ChapterChip";
import { LowerThird } from "../components/LowerThird";
import { GreenBurst } from "../components/GreenBurst";
import { FRAME } from "../layout";

// Scene-relative frame where "Send wholesale pricing to Fern Cafe" lands in the
// green DONE strip. today-hero usable arc (clip t2..22) plays at 2.4x, so the
// checkoff (clip ~t20.5) surfaces around scene frame 231. Burst fires there.
const CHECKOFF_FRAME = 231;

/** SC6 (250f): the one page. Real today-hero footage (overdue -> checkoff -> done) + captions. */
export const SC6Today: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url="today"
          sceneDuration={durationInFrames}
          zoom={{ from: 1.0, to: 1.0 }}
          pan={{ x: 0, y: 0 }}
        >
          <Footage
            id="today-hero"
            label="Today"
            page="today"
            variant="today"
            showFrames={durationInFrames}
            trimStart={0}
            playbackRate={2.4}
          />
        </BrowserFrame>
      </div>

      <ChapterChip index="04" title="The one page" durationInFrames={durationInFrames} />

      {/* Rapid captions tracking the real action; footage scroll carries the motion.
          The green "watch it go green" caption closes the scene over the burst. */}
      <Sequence from={8} durationInFrames={52}>
        <LowerThird text="Red means it needs you now" accent="red" durationInFrames={52} />
      </Sequence>
      <Sequence from={60} durationInFrames={54}>
        <LowerThird text="GOTT read the real thread" sub="Sam is waiting 4 days" accent="red" durationInFrames={54} />
      </Sequence>
      <Sequence from={114} durationInFrames={46}>
        <LowerThird text="Silence for 3+ days? Time to nudge" durationInFrames={46} />
      </Sequence>
      <Sequence from={160} durationInFrames={48}>
        <LowerThird
          text="Priority is computed by code"
          sub="No AI ordering. No invented dates."
          durationInFrames={48}
        />
      </Sequence>
      <Sequence from={208} durationInFrames={durationInFrames - 208}>
        <LowerThird text="Check it off, watch it go green" accent="green" durationInFrames={durationInFrames - 208} />
      </Sequence>

      {/* Green celebration burst on the freshly-done item in the DONE strip. */}
      <Sequence from={0} durationInFrames={durationInFrames}>
        <GreenBurst x={762} y={898} at={CHECKOFF_FRAME} />
      </Sequence>
    </AbsoluteFill>
  );
};
