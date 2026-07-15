import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "./BrowserFrame";
import { Footage } from "./Footage";
import { LowerThird } from "./LowerThird";
import { GreenBurst } from "./GreenBurst";
import { FRAME } from "../layout";

export type Caption = {
  text: string;
  sub?: string;
  accent?: "ink" | "red" | "green";
  from: number; // scene-relative start frame
  dur: number; // frames on screen
};

type Props = {
  /** path after localhost:3000/, shown in the URL pill, e.g. "today". */
  url: string;
  footage: {
    id: string; // clip id in the manifest
    label: string; // stand-in label
    page: string; // active nav for the stand-in
    variant?: string; // stand-in content variant
    trimStart?: number; // frames into the usable clip to begin
    playbackRate?: number; // calm 0.85-1.6; NOT the old frantic 2.4x
  };
  durationInFrames: number;
  /** at most a couple of short lower-thirds; the product carries the scene. */
  captions?: Caption[];
  /** optional green celebration on a real check-off going done. */
  greenBurst?: { x: number; y: number; at: number };
};

/**
 * One app surface, shown the Notion/Linear way: real footage FILLING a big,
 * centered, symmetric browser frame with a single short caption. No kinetic
 * text, no set-pieces - just the product being used, calmly.
 */
export const AppSection: React.FC<Props> = ({
  url,
  footage,
  durationInFrames,
  captions = [],
  greenBurst,
}) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url={url}
          sceneDuration={durationInFrames}
          zoom={{ from: 1.0, to: 1.0 }} // no Ken-Burns push: the footage motion is enough, and it keeps captions/burst aligned
          pan={{ x: 0, y: 0 }}
        >
          <Footage
            id={footage.id}
            label={footage.label}
            page={footage.page}
            variant={footage.variant}
            showFrames={durationInFrames}
            trimStart={footage.trimStart ?? 0}
            playbackRate={footage.playbackRate ?? 1}
          />
        </BrowserFrame>
      </div>

      {captions.map((c, i) => (
        <Sequence key={i} from={c.from} durationInFrames={c.dur} name={`caption-${i}`}>
          <LowerThird text={c.text} sub={c.sub} accent={c.accent ?? "ink"} durationInFrames={c.dur} />
        </Sequence>
      ))}

      {greenBurst ? (
        <Sequence from={0} durationInFrames={durationInFrames}>
          <GreenBurst x={greenBurst.x} y={greenBurst.y} at={greenBurst.at} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
