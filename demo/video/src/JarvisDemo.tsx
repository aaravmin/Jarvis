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
import { type PointTarget } from "./components/Pointer";
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
// The app holds a busy spinner on the just-checked row through router.refresh(); hold the green "done"
// stamp over it for the whole "done" beat (until the nav-to-Goals click at ~frame 189) so green = done
// reads cleanly the entire time the checked row is on screen, never the muted spinner.
const SC6B_CLICKS = SC6B.clicks.map((c) => (c.kind === "check" ? { ...c, stampFade: 188 } : c));

// --- Focus targets (page coords measured off the clean-dashboard stills; the app column is CONTAINED
// and centered now, so content sits around x=625-1520). Each holds the FULL dashboard (context), eases
// INTO the element, HOLDS while the caption explains, then eases back OUT so the viewer re-orients. ---
const SC3_FOCUS: Focus[] = [
  focus(940, 322, 1.5, { inStart: 26, inEnd: 52, outStart: DUR.goals - 40, outEnd: DUR.goals - 12 }),
];
const SC4_FOCUS: Focus[] = [
  focus(880, 228, 1.85, { inStart: 24, inEnd: 52, outStart: DUR.connect - 40, outEnd: DUR.connect - 12 }),
];
// SC5 uses TWO targets: a gentle look at the ordered Overdue list, then a close look at the red reply.
const SC5_FOCUS: Focus[] = [
  focus(1010, 210, 1.32, { inStart: 14, inEnd: 36, outStart: 60, outEnd: 78 }),
  focus(1080, 396, 1.85, { inStart: 82, inEnd: 104, outStart: DUR.day - 28, outEnd: DUR.day - 10 }),
];
const SC6A_FOCUS: Focus[] = [
  focus(1130, 846, 1.45, { inStart: 20, inEnd: 46, outStart: DUR.suggested - 28, outEnd: DUR.suggested - 10 }),
];
// SC6b features the completion: a gentle zoom into the check-off row so "done" (green) reads, easing
// back out before the nav-to-Goals click so its push + the goal landing play at full frame. The goal it
// advances is then marked by a ring (below), not another zoom, so the tail plays clean.
const SC6B_FOCUS: Focus[] = SC6B_CHECK
  ? [focus(810, 373, 1.28, { inStart: 6, inEnd: 30, outStart: 150, outEnd: 172 })]
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
  { text: "Her day comes back in priority order.", from: 12, dur: 64 },
  { text: "A reply she owes, before it slips.", accent: "red", from: 82, dur: DUR.day - 94 },
];
const SC6A_CAPTIONS: Caption[] = [
  { text: "Otto only surfaces what matters,", from: 14, dur: 50 },
  { text: "for you to approve.", from: 68, dur: DUR.suggested - 80 },
];
const SC6B_CAPTIONS: Caption[] = (() => {
  const caps: Caption[] = [];
  if (SC6B_CHECK) caps.push({ text: "It becomes a task you finish,", accent: "green", from: 10, dur: 150 });
  // Land the second line just as the Goals page actually paints in the footage (~0.9s after the click).
  if (SC6B_NAV) caps.push({ text: "and moves a goal forward.", from: SC6B_NAV.frame + 30, dur: SC6B.duration - (SC6B_NAV.frame + 30) - 6 });
  return caps;
})();

// --- Pointing: every caption draws a RING around the exact element it describes + a CONNECTOR from the
// caption up to it. Coords are page-space element boxes (measured off the stills). Accent: goal=caramel
// (the goal spine), red=urgent, green=done, ink=neutral. Timings track their caption. ---
const SC3_POINTERS: PointTarget[] = [
  // "working toward" -> the big goal
  { pageX: 717, pageY: 264, w: 172, h: 28, accent: "goal", from: 18, dur: 74, anchorX: 360, anchorY: 905 },
  // "broken down into this week" -> its weekly goals
  { pageX: 762, pageY: 358, w: 210, h: 96, accent: "goal", from: 100, dur: 68, anchorX: 360, anchorY: 905 },
];
const SC4_POINTERS: PointTarget[] = [
  // "reads her email, meetings, and Notion" -> the source chip on the task
  { pageX: 986, pageY: 228, w: 222, h: 28, accent: "ink", from: 14, dur: 78, anchorX: 380, anchorY: 905 },
  // "ties every task to a goal" -> the goal chip (the link)
  { pageX: 795, pageY: 228, w: 156, h: 26, accent: "goal", from: 100, dur: DUR.connect - 112, anchorX: 360, anchorY: 905 },
];
const SC5_POINTERS: PointTarget[] = [
  // "in priority order" -> the Overdue (top-priority) bucket header
  { pageX: 660, pageY: 113, w: 82, h: 26, accent: "ink", from: 16, dur: 58, anchorX: 340, anchorY: 905 },
  // "a reply she owes, before it slips" -> the red waiting time
  { pageX: 1439, pageY: 383, w: 146, h: 26, accent: "red", from: 84, dur: DUR.day - 98, anchorX: 560, anchorY: 895 },
];
const SC6A_POINTERS: PointTarget[] = [
  // "what matters" -> the goal a suggestion serves (the spine weekly goal)
  { pageX: 795, pageY: 853, w: 156, h: 26, accent: "goal", from: 16, dur: 48, anchorX: 380, anchorY: 930 },
  // "for you to approve" -> that suggestion's Accept
  { pageX: 1463, pageY: 838, w: 98, h: 40, accent: "ink", from: 68, dur: DUR.suggested - 82, anchorX: 520, anchorY: 895 },
];
const SC6B_POINTERS: PointTarget[] = (() => {
  const pts: PointTarget[] = [];
  // "It becomes a task you finish" -> the checkbox + title going done (green)
  if (SC6B_CHECK) pts.push({ pageX: 748, pageY: 370, w: 238, h: 38, accent: "green", from: 10, dur: 150, anchorX: 360, anchorY: 905 });
  // "and moves a goal forward" -> the big goal on the Goals landing (caramel spine)
  if (SC6B_NAV) pts.push({ pageX: 717, pageY: 264, w: 172, h: 28, accent: "goal", from: SC6B_NAV.frame + 30, dur: SC6B.duration - (SC6B_NAV.frame + 30) - 8, anchorX: 360, anchorY: 905 });
  return pts;
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
            pointers={SC3_POINTERS}
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
            pointers={SC4_POINTERS}
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
            pointers={SC5_POINTERS}
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
            pointers={SC6A_POINTERS}
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
            clicks={SC6B_CLICKS}
            focuses={SC6B_FOCUS}
            pointers={SC6B_POINTERS}
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
