import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "../components/BrowserFrame";
import { Footage } from "../components/Footage";
import { ChapterChip } from "../components/ChapterChip";
import { Callout } from "../components/Callout";
import { LowerThird } from "../components/LowerThird";
import { GreenBurst } from "../components/GreenBurst";
import { FRAME } from "../layout";

// Scene-relative frame of the checkoff moment in F3. Tuned in Phase 2 from the
// real clip; the green burst + "watch it go green" callout sync to it.
const CHECKOFF_FRAME = 1140;

/** SC6 2480-3960 (1480f): the one page. F3 footage + five callouts + green burst. */
export const SC6Today: React.FC<{ durationInFrames: number; playbackRate?: number; trimStart?: number }> = ({
  durationInFrames,
  playbackRate = 1,
  trimStart = 0,
}) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url="today"
          sceneDuration={durationInFrames}
          zoom={{ from: 1.01, to: 1.05 }}
          pan={{ x: 0, y: -0.2 }}
          panEase={0.9}
        >
          <Footage
            id="F3"
            label="Today"
            page="today"
            variant="today"
            showFrames={durationInFrames}
            playbackRate={playbackRate}
            trimStart={trimStart}
          />
        </BrowserFrame>
      </div>

      <ChapterChip index="04" title="The one page" durationInFrames={durationInFrames} />

      {/* C1 - overdue, red */}
      <Sequence from={64} durationInFrames={200}>
        <Callout
          region={{ x: 656, y: 266, w: 816, h: 92 }}
          label="Red means it needs you now"
          placement="bottom"
          color="red"
          durationInFrames={200}
        />
      </Sequence>

      {/* C2 - needs reply, red */}
      <Sequence from={300} durationInFrames={260}>
        <Callout
          region={{ x: 656, y: 372, w: 816, h: 122 }}
          label="Jarvis read the thread: Sam is waiting 4 days"
          placement="bottom"
          color="red"
          durationInFrames={260}
        />
      </Sequence>

      {/* C3 - reply button, ink */}
      <Sequence from={590} durationInFrames={170}>
        <Callout
          region={{ x: 1286, y: 452, w: 168, h: 40 }}
          label="One click to reply"
          placement="left"
          color="ink"
          durationInFrames={170}
        />
      </Sequence>

      {/* C4 - waiting on them, ink */}
      <Sequence from={800} durationInFrames={200}>
        <Callout
          region={{ x: 656, y: 566, w: 816, h: 96 }}
          label="Silence for 3+ days? Time to nudge."
          placement="bottom"
          color="ink"
          durationInFrames={200}
        />
      </Sequence>

      {/* C5 - check it off, green + burst synced to checkoff */}
      <Sequence from={CHECKOFF_FRAME - 90} durationInFrames={300}>
        <Callout
          region={{ x: 634, y: 566, w: 40, h: 40 }}
          label="Check it off, watch it go green"
          placement="right"
          color="green"
          durationInFrames={300}
        />
      </Sequence>
      <Sequence from={0} durationInFrames={durationInFrames}>
        <GreenBurst x={654} y={586} at={CHECKOFF_FRAME} />
      </Sequence>

      <Sequence from={CHECKOFF_FRAME - 20} durationInFrames={durationInFrames - (CHECKOFF_FRAME - 20)}>
        <LowerThird
          text="Priority is computed by code."
          sub="No AI ordering. No invented dates."
          durationInFrames={durationInFrames - (CHECKOFF_FRAME - 20)}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
