import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENES } from "./theme";
import { clipTailTrim } from "./footage";
import { Backdrop } from "./components/Backdrop";
import { SceneWrap } from "./components/SceneWrap";
import { AppSection, type Caption } from "./components/AppSection";
import { IntroDriftwood } from "./scenes/IntroDriftwood";
import { OutroOtto } from "./scenes/OutroOtto";

// Crossfade tail: a scene keeps rendering this many frames past its end, behind
// the incoming scene which fades in over it -> a soft dissolve, like navigating
// from one page to the next. 10f reads as a calm cut, not a hard flash.
const FADE = 10;

// The Suggested section lives at the very end of the Today clip (Review was folded into Today). We reuse
// that one clip: the `today` scene plays its head (the red Overdue cards), and `suggested` plays its
// tail (the held Suggested section), anchored to the clip's end so it lands on the hold every time.
const SUGGESTED_RATE = 1.0;
const SUGGESTED_TRIM = clipTailTrim("today", Math.ceil(SCENES.suggested.duration * SUGGESTED_RATE), 0.4);

// --- Captions: at most ONE short, concrete lower-third per surface. The product carries every scene;
// most surfaces run nearly caption-free and just let the real UI speak. ---

// today plays at ~1.02x from the top: the overdue-red hold + the red "Reply to Sam Okafor" needs-reply
// card fill the first ~4.5s, then the feed scrolls its sections. The one red caption lands while that red
// card is on screen - that IS the synced red highlight.
const TODAY_CAPTIONS: Caption[] = [
  { text: "It reads the thread.", sub: "Sam has been waiting 4 days.", accent: "red", from: 20, dur: 108 },
];

// suggested plays the Today clip's tail: the "Suggested" section, each item gated by Accept / Dismiss (L0).
const SUGGESTED_CAPTIONS: Caption[] = [
  { text: "Nothing is added without your approval.", from: 18, dur: 116 },
];

// tasks plays at 1.3x: the dense sheet, then the cursor checks off "Book Probat quarterly service" and it
// strikes through green in place. The one green caption is timed to land on that check-off and hold on it.
const TASKS_CAPTIONS: Caption[] = [
  { text: "Check it off when it is done.", accent: "green", from: 150, dur: 55 },
];

// goals opens on "Grow wholesale revenue" with its weekly goals nested under it (the roll-up), then reveals
// the inline "Add weekly goal" form. The one caption lands on that nested list.
const GOALS_CAPTIONS: Caption[] = [
  { text: "Weekly goals roll up to each big goal.", from: 18, dur: 128 },
];

type SceneDef = {
  key: keyof typeof SCENES;
  render: (dur: number) => React.ReactNode;
  last?: boolean;
};

const ORDER: SceneDef[] = [
  { key: "intro", render: (d) => <IntroDriftwood durationInFrames={d} /> },
  {
    key: "today",
    render: (d) => (
      <AppSection
        url="today"
        durationInFrames={d}
        footage={{ id: "today", label: "Today", page: "today", variant: "today", playbackRate: 1.02 }}
        captions={TODAY_CAPTIONS}
      />
    ),
  },
  {
    key: "suggested",
    render: (d) => (
      <AppSection
        url="today"
        durationInFrames={d}
        footage={{
          id: "today",
          label: "Suggested",
          page: "today",
          variant: "today",
          trimStart: SUGGESTED_TRIM,
          playbackRate: SUGGESTED_RATE,
        }}
        captions={SUGGESTED_CAPTIONS}
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
    key: "goals",
    render: (d) => (
      <AppSection
        url="goals"
        durationInFrames={d}
        footage={{ id: "goals", label: "Goals", page: "goals", variant: "goals", playbackRate: 1.2 }}
        captions={GOALS_CAPTIONS}
      />
    ),
  },
  { key: "close", render: (d) => <OutroOtto durationInFrames={d} />, last: true },
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
