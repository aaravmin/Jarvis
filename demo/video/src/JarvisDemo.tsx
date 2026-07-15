import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { SCENES } from "./theme";
import { getClip, clipTailTrim } from "./footage";
import { Backdrop } from "./components/Backdrop";
import { SceneWrap } from "./components/SceneWrap";
import { AppSection, type Caption } from "./components/AppSection";
import { IntroDriftwood } from "./scenes/IntroDriftwood";
import { OutroOtto } from "./scenes/OutroOtto";

// Crossfade tail: a scene keeps rendering this many frames past its end, behind
// the incoming scene which fades in over it -> a soft dissolve, like navigating
// from one page to the next. 10f reads as a calm cut, not a hard flash.
const FADE = 10;

// The command palette is a signature Notion/Linear moment; fall back to the
// calendar surface only if that clip somehow isn't in the footage.
const CMDK = getClip("cmdk") !== null;

// The Suggested section lives at the very end of the Today clip (Review was folded into Today). We reuse
// that one clip: the `today` scene plays its head (the red Overdue cards), and `suggested` plays its
// tail (the held Suggested section), anchored to the clip's end so it lands on the hold every time.
const SUGGESTED_RATE = 1.0;
const SUGGESTED_TRIM = clipTailTrim("today", Math.ceil(SCENES.suggested.duration * SUGGESTED_RATE), 0.4);

// --- Captions: at most one or two short lower-thirds per surface. The product
// carries every scene; captions only name what you are looking at. ---

// today plays at ~1.02x from the top: the overdue-red hold + the "Reply to Sam Okafor" needs-reply card
// are the first ~5s; the red caption lands while that red card is on screen (that IS the synced red
// highlight), then the feed scrolls its sections. Captions are staggered so no two overlap on screen.
const TODAY_CAPTIONS: Caption[] = [
  { text: "Everything that needs you.", sub: "In priority order, computed by code.", from: 10, dur: 74 },
  { text: "It reads the thread.", sub: "Sam has been waiting 4 days.", accent: "red", from: 92, dur: 122 },
  { text: "Now, soon, and later.", from: 252, dur: 112 },
];

// suggested plays the Today clip's tail: the "Suggested" section, each item gated by Accept / Dismiss.
const SUGGESTED_CAPTIONS: Caption[] = [
  { text: "It suggests. You approve.", sub: "Nothing is auto-accepted.", from: 28, dur: 172 },
];

// tasks plays at ~0.94x (a calm read of the sheet), ending on the check-off well before the clip's tail.
// After a slow pan the "Book Probat quarterly service" row strikes through green; the green caption is
// timed to land on that moment.
const TASKS_CAPTIONS: Caption[] = [
  { text: "Tasks, like a sheet.", sub: "Dense rows. Sort, edit, done.", from: 20, dur: 120 },
  { text: "Check it off. Done.", accent: "green", from: 200, dur: 88 },
];

const CMDK_CAPTIONS: Caption[] = [
  { text: "Jump anywhere.", sub: "Press Cmd K, then type.", from: 20, dur: 148 },
];

const GOALS_CAPTIONS: Caption[] = [
  { text: "Grounded in your goals.", sub: "Goals, and weekly goals.", from: 16, dur: 140 },
  { text: "Every task ladders up to one.", from: 206, dur: 120 },
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
        footage={{ id: "tasks", label: "Tasks", page: "tasks", variant: "tasks", playbackRate: 0.9375 }}
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
          footage={{ id: "cmdk", label: "Command", page: "today", variant: "today", playbackRate: 1.1 }}
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
