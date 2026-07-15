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
  const s = spring({ frame: frame - 2, fps, config: { damping: 200, mass: 0.55, stiffness: 175 } });
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
  trimStart?: number;
  playbackRate?: number;
}> = ({ id, url, variant, caption, frames, trimStart = 0, playbackRate = 1 }) => (
  <AbsoluteFill>
    <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
      <BrowserFrame url={url} sceneDuration={frames} zoom={{ from: 1.02, to: 1.05 }} pan={{ x: 0, y: -0.4 }}>
        <Footage id={id} label={url} page={url} variant={variant} showFrames={frames} trimStart={trimStart} playbackRate={playbackRate} />
      </BrowserFrame>
    </div>
    <Caption text={caption} />
  </AbsoluteFill>
);

/** SC7 (112f): montage, five quick-wipe cuts (a new page every ~21 frames). */
export const SC7Montage: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const T = 7; // transition frames
  const items = [
    { id: "montage-meetings", url: "meetings", variant: "meetings", caption: "Meeting notes to tasks", frames: 28, trimStart: 0, playbackRate: 1.5 },
    { id: "montage-email", url: "email", variant: "email", caption: "Only email that matters", frames: 28, trimStart: 30, playbackRate: 2.6 },
    { id: "montage-calendar", url: "calendar", variant: "calendar", caption: "Calendar, aware", frames: 28, trimStart: 30, playbackRate: 2.6 },
    { id: "montage-tasks", url: "tasks", variant: "tasks", caption: "The full ledger", frames: 28, trimStart: 60, playbackRate: 1.6 },
    { id: "goals-after", url: "goals", variant: "goals", caption: "Goals, advancing", frames: 28, trimStart: 30, playbackRate: 1.6 },
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
