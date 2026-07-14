import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENES } from "./theme";
import { Backdrop } from "./components/Backdrop";
import { SceneWrap } from "./components/SceneWrap";
import { SC1Intro } from "./scenes/SC1Intro";
import { SC2Premise } from "./scenes/SC2Premise";
import { SC3Goals } from "./scenes/SC3Goals";
import { SC4Ingest } from "./scenes/SC4Ingest";
import { SC5Review } from "./scenes/SC5Review";
import { SC6Today } from "./scenes/SC6Today";
import { SC7Montage } from "./scenes/SC7Montage";
import { SC8Rules } from "./scenes/SC8Rules";
import { SC9Outro } from "./scenes/SC9Outro";

// Crossfade tail: a scene keeps rendering this many frames past its end, behind
// the incoming scene which fades in over it -> a true dissolve, no canvas flash.
const FADE = 16;

type SceneDef = {
  key: keyof typeof SCENES;
  Component: React.FC<{ durationInFrames: number }>;
  last?: boolean;
};

const ORDER: SceneDef[] = [
  { key: "intro", Component: SC1Intro },
  { key: "premise", Component: SC2Premise },
  { key: "goals", Component: SC3Goals },
  { key: "ingest", Component: SC4Ingest },
  { key: "review", Component: SC5Review },
  { key: "today", Component: SC6Today },
  { key: "montage", Component: SC7Montage },
  { key: "rules", Component: SC8Rules },
  { key: "outro", Component: SC9Outro, last: true },
];

export const JarvisDemo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Backdrop />
      {ORDER.map(({ key, Component, last }) => {
        const s = SCENES[key];
        const dur = last ? s.duration : s.duration + FADE;
        return (
          <Sequence key={key} from={s.from} durationInFrames={dur} name={key}>
            <SceneWrap durationInFrames={dur} fadeIn={FADE} fadeOut={last ? 0 : FADE}>
              <Component durationInFrames={s.duration} />
            </SceneWrap>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
