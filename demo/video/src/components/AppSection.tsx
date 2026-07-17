import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrowserFrame } from "./BrowserFrame";
import { Footage } from "./Footage";
import { LowerThird } from "./LowerThird";
import { GreenBurst } from "./GreenBurst";
import { ClickFx, type FxClick } from "./ClickFx";
import { ExampleTag } from "./ExampleTag";
import { Pointer, type PointTarget } from "./Pointer";
import { FRAME } from "../layout";
import type { Focus } from "../motion";

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
    still?: string; // a pre-extracted still (public/stills/<file>) instead of video, for focus scenes
    trimStart?: number; // frames into the usable clip to begin
    playbackRate?: number; // calm 0.85-1.6; NOT the old frantic 2.4x
  };
  durationInFrames: number;
  /** at most a couple of short lower-thirds; the product carries the scene. */
  captions?: Caption[];
  /** optional green celebration on a real check-off going done. */
  greenBurst?: { x: number; y: number; at: number };
  /** real clicks in the footage -> status pulse + zoom-on-click + page-switch sweep, in sync. */
  clicks?: FxClick[];
  /** focus + context zoom targets scripted to caption beats (zoom into an element, hold, zoom out). */
  focuses?: Focus[];
  /** highlight ring + connector targets: every caption points at the exact element it describes. */
  pointers?: PointTarget[];
  /** dynamic URL pill that flips with real in-footage navigation (scene-relative frames). */
  urlSwitches?: Array<{ frame: number; url: string }>;
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
  clicks = [],
  focuses = [],
  pointers = [],
  urlSwitches,
}) => {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.w, height: FRAME.h }}>
        <BrowserFrame
          url={url}
          sceneDuration={durationInFrames}
          zoom={{ from: 1.0, to: 1.0 }} // BrowserFrame stays fixed; the ClickFx layer owns the focus/click zoom
          pan={{ x: 0, y: 0 }}
          urlSwitches={urlSwitches}
        >
          <ClickFx clicks={clicks} focuses={focuses} sceneDuration={durationInFrames} idle={clicks.length === 0}>
            <Footage
              id={footage.id}
              label={footage.label}
              page={footage.page}
              variant={footage.variant}
              still={footage.still}
              showFrames={durationInFrames}
              trimStart={footage.trimStart ?? 0}
              playbackRate={footage.playbackRate ?? 1}
            />
          </ClickFx>
        </BrowserFrame>
      </div>

      {/* Persistent "Example . Brown Bee Coffee" watermark - Otto is the tool, Brown Bee is the sample. */}
      <ExampleTag durationInFrames={durationInFrames} />

      {/* Highlight ring + connector: every caption visibly points at the element it describes. Drawn
          above the frame but below the caption text, and tracks the live focus/click zoom. */}
      <Pointer
        targets={pointers}
        clicks={clicks}
        focuses={focuses}
        sceneDuration={durationInFrames}
        idle={clicks.length === 0}
      />

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
