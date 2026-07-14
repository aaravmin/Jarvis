import React from "react";
import { AbsoluteFill, spring, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { wipe } from "@remotion/transitions/wipe";
import { BrowserFrame } from "../components/BrowserFrame";
import { Footage } from "../components/Footage";
import { ChapterChip } from "../components/ChapterChip";
import { theme, font, shadow } from "../theme";
import { FRAME } from "../layout";

const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 200, mass: 0.7, stiffness: 130 } });
  const y = interpolate(s, [0, 1], [24, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 60,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${y}px)`,
        opacity: s,
      }}
    >
      <div
        style={{
          padding: "14px 28px",
          borderRadius: 14,
          background: theme.inkStrong,
          color: "#fff",
          fontFamily: font.sans,
          fontSize: 27,
          fontWeight: 700,
          letterSpacing: 0.1,
          boxShadow: shadow.float,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Item: React.FC<{
  id: string;
  url: string;
  variant: string;
  caption: string;
  frames: number;
}> = ({ id, url, variant, caption, frames }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
      <BrowserFrame url={url} sceneDuration={frames} zoom={{ from: 1.02, to: 1.05 }} pan={{ x: 0, y: -0.4 }}>
        <Footage id={id} label={url} page={url} variant={variant} showFrames={frames} />
      </BrowserFrame>
    </div>
    <Caption text={caption} />
  </AbsoluteFill>
);

/** SC7 3960-4700 (740f): montage, five quick-wipe cuts. */
export const SC7Montage: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const T = 10; // transition frames
  const items = [
    { id: "F4", url: "meetings", variant: "meetings", caption: "Meeting notes become action items", frames: 150 },
    { id: "F5", url: "email", variant: "email", caption: "Only the email that matters", frames: 150 },
    { id: "F6", url: "calendar", variant: "calendar", caption: "Calendar, aware of your commitments", frames: 150 },
    { id: "F7", url: "tasks", variant: "tasks", caption: "The full ledger", frames: 150 },
    { id: "F8", url: "goals", variant: "goals", caption: "Goals, advancing.", frames: 180 },
  ];

  return (
    <AbsoluteFill>
      <TransitionSeries>
        {items.map((it, i) => (
          <React.Fragment key={it.id}>
            <TransitionSeries.Sequence durationInFrames={it.frames}>
              <Item {...it} />
            </TransitionSeries.Sequence>
            {i < items.length - 1 ? (
              <TransitionSeries.Transition
                presentation={wipe({ direction: i % 2 === 0 ? "from-right" : "from-bottom" })}
                timing={linearTiming({ durationInFrames: T })}
              />
            ) : null}
          </React.Fragment>
        ))}
      </TransitionSeries>

      <ChapterChip index="05" title="Everything, in one place" durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};
