import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENES } from "./theme";
import { getClip } from "./footage";
import { Backdrop } from "./components/Backdrop";
import { SceneWrap } from "./components/SceneWrap";
import { AppSection, type Caption } from "./components/AppSection";
import { SC1Intro } from "./scenes/SC1Intro";
import { SC9Outro } from "./scenes/SC9Outro";

// Crossfade tail: a scene keeps rendering this many frames past its end, behind
// the incoming scene which fades in over it -> a soft dissolve, like navigating
// from one page to the next. 10f reads as a calm cut, not a hard flash.
const FADE = 10;

// The command palette is a signature Notion/Linear moment; fall back to the
// calendar surface only if that clip somehow isn't in the footage.
const CMDK = getClip("cmdk") !== null;

// --- Captions: at most one or two short lower-thirds per surface. The product
// carries every scene; captions only name what you are looking at. ---

// today plays at 1.3x. The overdue-red hold + the "Reply to Sam Okafor" needs-
// reply card are the first ~4s; the red caption lands while that red card is on
// screen (that IS the synced red highlight), then the feed scrolls its sections.
const TODAY_CAPTIONS: Caption[] = [
  { text: "Everything that needs you.", sub: "In priority order, computed by code.", from: 10, dur: 78 },
  { text: "It reads the thread.", sub: "Sam has been waiting 4 days.", accent: "red", from: 96, dur: 134 },
  { text: "Now, soon, and later.", from: 250, dur: 100 },
];

const REVIEW_CAPTIONS: Caption[] = [
  { text: "Approve what it found.", sub: "It suggests. You approve.", from: 40, dur: 176 },
];

// tasks plays at 1.3x. After a slow pan the "Book Probat quarterly service" row
// is checked off and strikes through green; the green caption is timed to land on
// that moment (the synced green highlight). from/at are tuned against real frames.
const TASKS_CAPTIONS: Caption[] = [
  { text: "Tasks, like a sheet.", sub: "Dense rows. Sort, edit, done.", from: 30, dur: 150 },
  { text: "Check it off. Done.", accent: "green", from: 338, dur: 112 },
];

const CMDK_CAPTIONS: Caption[] = [
  { text: "Jump anywhere.", sub: "Press Cmd K, then type.", from: 24, dur: 140 },
];

const GOALS_CAPTIONS: Caption[] = [
  { text: "Grounded in your goals.", sub: "Every task ladders up to one.", from: 40, dur: 190 },
];

type SceneDef = {
  key: keyof typeof SCENES;
  render: (dur: number) => React.ReactNode;
  last?: boolean;
};

const ORDER: SceneDef[] = [
  { key: "open", render: (d) => <SC1Intro durationInFrames={d} /> },
  {
    key: "today",
    render: (d) => (
      <AppSection
        url="today"
        durationInFrames={d}
        footage={{ id: "today", label: "Today", page: "today", variant: "today", playbackRate: 1.3 }}
        captions={TODAY_CAPTIONS}
      />
    ),
  },
  {
    key: "review",
    render: (d) => (
      <AppSection
        url="review"
        durationInFrames={d}
        footage={{ id: "review", label: "Review", page: "review", variant: "review", playbackRate: 1.15 }}
        captions={REVIEW_CAPTIONS}
      />
    ),
  },
  {
    key: "tasks",
    render: (d) => (
      <AppSection
        url="tasks"
        durationInFrames={d}
        footage={{ id: "tasks", label: "Tasks", page: "tasks", variant: "tasks", playbackRate: 1.3 }}
        captions={TASKS_CAPTIONS}
      />
    ),
  },
  {
    key: "cmdk",
    render: (d) =>
      CMDK ? (
        <AppSection
          url="today"
          durationInFrames={d}
          footage={{ id: "cmdk", label: "Command", page: "today", variant: "today", playbackRate: 1.0 }}
          captions={CMDK_CAPTIONS}
        />
      ) : (
        <AppSection
          url="calendar"
          durationInFrames={d}
          footage={{ id: "calendar", label: "Calendar", page: "calendar", variant: "calendar", playbackRate: 0.9 }}
          captions={[{ text: "And what's coming up.", from: 24, dur: 140 }]}
        />
      ),
  },
  {
    key: "goals",
    render: (d) => (
      <AppSection
        url="goals"
        durationInFrames={d}
        footage={{ id: "goals", label: "Goals", page: "goals", variant: "goals", playbackRate: 1.1 }}
        captions={GOALS_CAPTIONS}
      />
    ),
  },
  { key: "close", render: (d) => <SC9Outro durationInFrames={d} />, last: true },
];

export const JarvisDemo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Backdrop />
      {ORDER.map(({ key, render, last }) => {
        const s = SCENES[key];
        const dur = last ? s.duration : s.duration + FADE;
        return (
          <Sequence key={key} from={s.from} durationInFrames={dur} name={key}>
            <SceneWrap durationInFrames={dur} fadeIn={FADE} fadeOut={last ? 0 : FADE}>
              {render(s.duration)}
            </SceneWrap>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
