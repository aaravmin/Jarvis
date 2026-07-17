import React from "react";
import { AbsoluteFill } from "remotion";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { DUR, TRANS } from "./theme";
import { buildWindow } from "./windows";
import { pageToView, type Focus } from "./motion";
import { Backdrop } from "./components/Backdrop";
import { AppSection, type Caption } from "./components/AppSection";
import { IntroOtto } from "./scenes/IntroOtto";
import { ExampleBrownBee } from "./scenes/ExampleBrownBee";
import { OutroOtto } from "./scenes/OutroOtto";

// ---------------------------------------------------------------------------
// STORY v2 - one connected flow, GOALS as the spine.
//
//   SC1 Otto (tool) -> SC2 an example: Brown Bee, scattered -> SC3 her GOALS + weekly goals (the lens)
//   -> SC4 Otto reads it all and ties every task to a GOAL (zoom the "Land 10 new cafe accounts" chip)
//   -> SC5 the day, most urgent first (zoom the red reply she owes) -> SC6a it only suggests, you approve
//   (zoom the "Grow wholesale revenue" chip on a suggestion) -> SC6b approve -> task -> DONE (green) ->
//   the goal it advances (the real continuous check-off + nav to Goals) -> SC7 Otto close.
//
// Every app beat ties back to a goal via a goal CHIP we zoom into - the visible connective tissue. The
// goal "Grow wholesale revenue" and its weekly goal "Land 10 new cafe accounts" recur across SC3/4/6.
// ---------------------------------------------------------------------------

/** A focus + context zoom target, authored in page-space (1920x1080) and mapped into the browser view. */
const focus = (
  pageX: number,
  pageY: number,
  scale: number,
  t: { inStart: number; inEnd: number; outStart: number; outEnd: number },
): Focus => {
  const v = pageToView(pageX, pageY);
  return { x: v.x, y: v.y, scale, ...t };
};

// --- The four FOCUS scenes are pre-extracted STILLS (see public/stills/), examined with a focus+context
// zoom. Stills are crisp and immune to the OffthreadVideo blank-tail under slow-mo. Only SC6b is video. ---
// SC6b: the continuous hero take from the Tasks table through the check-off (green) and nav to Goals.
const SC6B = buildWindow("hero", 7.7, 16.4, { playback: 1.0, baseUrl: "tasks", clickTrack: "hero" });
const SC6B_CHECK = SC6B.clicks.find((c) => c.kind === "check");
const SC6B_NAV = SC6B.clicks.filter((c) => c.kind === "nav").slice(-1)[0];

// --- Focus targets (page coords measured off the footage; content is left-aligned in the column) ---
// Each holds the FULL dashboard (context) for a beat, eases INTO the element, holds while the caption
// explains, then eases back OUT so the viewer re-orients where it lives.
const SC3_FOCUS: Focus[] = [focus(655, 335, 2.05, { inStart: 34, inEnd: 60, outStart: DUR.goals - 40, outEnd: DUR.goals - 12 })];
const SC4_FOCUS: Focus[] = [focus(662, 450, 2.3, { inStart: 34, inEnd: 62, outStart: DUR.connect - 40, outEnd: DUR.connect - 12 })];
const SC5_FOCUS: Focus[] = [focus(952, 322, 1.9, { inStart: 32, inEnd: 58, outStart: DUR.day - 36, outEnd: DUR.day - 12 })];
const SC6A_FOCUS: Focus[] = [focus(705, 975, 1.7, { inStart: 26, inEnd: 52, outStart: DUR.suggested - 34, outEnd: DUR.suggested - 10 })];
// SC6b features the completion: a gentle zoom into the check-off row so "done" (green) reads, easing back
// out before the nav-to-Goals click so its push + the goal landing play at full frame.
const SC6B_FOCUS: Focus[] = SC6B_CHECK
  ? [focus(600, 373, 1.3, {
      inStart: SC6B_CHECK.frame - 16,
      inEnd: SC6B_CHECK.frame + 6,
      outStart: (SC6B_NAV?.frame ?? SC6B_CHECK.frame + 120) - 40,
      outEnd: (SC6B_NAV?.frame ?? SC6B_CHECK.frame + 120) - 16,
    })]
  : [];

// --- Captions: a flowing narrative, one connected line to the next (Figtree, no em dashes). ---
const SC3_CAPTIONS: Caption[] = [
  { text: "Otto starts with what she is working toward.", from: 14, dur: 80 },
  { text: "Big goals, broken down into this week.", from: 100, dur: DUR.goals - 112 },
];
const SC4_CAPTIONS: Caption[] = [
  { text: "Then it reads her email, meetings, and Notion,", from: 12, dur: 82 },
  { text: "and ties every task to a goal.", from: 100, dur: DUR.connect - 112 },
];
const SC5_CAPTIONS: Caption[] = [
  { text: "Her day comes back in priority order.", from: 12, dur: 66 },
  { text: "A reply she owes, before it slips.", accent: "red", from: 82, dur: DUR.day - 94 },
];
const SC6A_CAPTIONS: Caption[] = [
  { text: "Otto only surfaces what matters, for you to approve.", from: 14, dur: DUR.suggested - 26 },
];
const SC6B_CAPTIONS: Caption[] = (() => {
  const caps: Caption[] = [];
  if (SC6B_CHECK) caps.push({ text: "It becomes a task you finish,", accent: "green", from: SC6B_CHECK.frame + 6, dur: 112 });
  // Land the second line just as the Goals page actually paints in the footage (~0.9s after the click).
  if (SC6B_NAV) caps.push({ text: "and moves a goal forward.", from: SC6B_NAV.frame + 30, dur: SC6B.duration - (SC6B_NAV.frame + 30) - 6 });
  return caps;
})();

// Timings: gentle fades throughout, with one soft slide for the "keep scrolling into Suggested" join.
const springy = springTiming({ config: { damping: 200, mass: 0.6, stiffness: 110 }, durationInFrames: TRANS });
const fadeT = linearTiming({ durationInFrames: TRANS });

export const JarvisDemo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Backdrop />
      <TransitionSeries>
        {/* SC1 - Otto, the tool */}
        <TransitionSeries.Sequence durationInFrames={DUR.intro}>
          <IntroOtto durationInFrames={DUR.intro} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        {/* SC2 - an example: Brown Bee Coffee, scattered */}
        <TransitionSeries.Sequence durationInFrames={DUR.example}>
          <ExampleBrownBee durationInFrames={DUR.example} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        {/* SC3 - GOALS + weekly goals (the lens). Still, zoomed into "Grow wholesale revenue". */}
        <TransitionSeries.Sequence durationInFrames={DUR.goals}>
          <AppSection
            url="goals"
            durationInFrames={DUR.goals}
            footage={{ id: "hero", label: "Goals", page: "goals", variant: "goals", still: "goals.png" }}
            captions={SC3_CAPTIONS}
            focuses={SC3_FOCUS}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        {/* SC4 - Otto reads it all and ties every task to a goal (zoom the goal chip). Same Today still. */}
        <TransitionSeries.Sequence durationInFrames={DUR.connect}>
          <AppSection
            url="today"
            durationInFrames={DUR.connect}
            footage={{ id: "today", label: "Today", page: "today", variant: "today", still: "today-scroll0.png" }}
            captions={SC4_CAPTIONS}
            focuses={SC4_FOCUS}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        {/* SC5 - the day, most urgent first (zoom the red reply she owes). Same Today still, new lens. */}
        <TransitionSeries.Sequence durationInFrames={DUR.day}>
          <AppSection
            url="today"
            durationInFrames={DUR.day}
            footage={{ id: "today", label: "Today", page: "today", variant: "today", still: "today-scroll0.png" }}
            captions={SC5_CAPTIONS}
            focuses={SC5_FOCUS}
          />
        </TransitionSeries.Sequence>
        {/* keep scrolling down the same page into Suggested */}
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={springy} />

        {/* SC6a - it only suggests; you approve (zoom a suggestion's weekly-goal chip). */}
        <TransitionSeries.Sequence durationInFrames={DUR.suggested}>
          <AppSection
            url="today"
            durationInFrames={DUR.suggested}
            footage={{ id: "today", label: "Suggested", page: "today", variant: "today", still: "today-suggested.png" }}
            captions={SC6A_CAPTIONS}
            focuses={SC6A_FOCUS}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        {/* SC6b - approve -> task -> DONE (green) -> the goal it advances (real continuous take) */}
        <TransitionSeries.Sequence durationInFrames={SC6B.duration}>
          <AppSection
            url="tasks"
            durationInFrames={SC6B.duration}
            footage={{ id: "hero", label: "Tasks", page: "tasks", variant: "tasks", trimStart: SC6B.trimStart, playbackRate: SC6B.playbackRate }}
            captions={SC6B_CAPTIONS}
            clicks={SC6B.clicks}
            focuses={SC6B_FOCUS}
            urlSwitches={SC6B.urlSwitches}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        {/* SC7 - Otto close */}
        <TransitionSeries.Sequence durationInFrames={DUR.close}>
          <OutroOtto durationInFrames={DUR.close} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

/** Total composition length = sum of scene durations minus the 7 overlapping transitions. */
export const TOTAL_FRAMES =
  DUR.intro + DUR.example + DUR.goals + DUR.connect + DUR.day + DUR.suggested + SC6B.duration + DUR.close - 7 * TRANS;
