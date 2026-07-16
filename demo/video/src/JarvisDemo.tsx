import React from "react";
import { AbsoluteFill } from "remotion";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";
import { DUR, TRANS, fps } from "./theme";
import { clipTailTrim } from "./footage";
import { HERO } from "./hero";
import { Backdrop } from "./components/Backdrop";
import { AppSection, type Caption } from "./components/AppSection";
import { IntroBrownBee } from "./scenes/IntroBrownBee";
import { OutroOtto } from "./scenes/OutroOtto";

// The Suggested section lives at the very end of the Today clip (Review was folded into Today). We reuse
// that one clip: the `today` scene plays its head (the red Overdue cards), and `suggested` plays its
// tail (the held Suggested section), anchored to the clip's end so it lands on the hold every time.
const SUGGESTED_TRIM = clipTailTrim("today", Math.ceil(DUR.suggested), 0.4);

// --- Captions: at most ONE short, concrete lower-third per surface. The product carries every scene. ---

// today: the red Overdue hold + the red "Reply to Sam Okafor" needs-reply card. The one red caption
// lands while that red card is on screen - the synced red highlight.
const TODAY_CAPTIONS: Caption[] = [
  { text: "It reads the thread.", sub: "Sam has been waiting 4 days.", accent: "red", from: 24, dur: 120 },
];

// suggested: the Today clip's tail - the "Suggested" section, each item gated by Accept / Dismiss (L0).
const SUGGESTED_CAPTIONS: Caption[] = [
  { text: "Nothing is added without your approval.", from: 16, dur: 112 },
];

// hero: two captions timed to the real clicks - the check-off going green, then landing on Goals.
const HERO_CAPTIONS: Caption[] = (() => {
  const check = HERO.clicks.find((c) => c.kind === "check");
  const navGoals = HERO.clicks.filter((c) => c.kind === "nav")[1];
  const caps: Caption[] = [];
  if (check) caps.push({ text: "Check it off when it is done.", accent: "green", from: check.frame + 24, dur: 92 });
  if (navGoals) caps.push({ text: "Weekly goals roll up to each big goal.", from: navGoals.frame + 30, dur: 96 });
  return caps;
})();

// Directional transitions give the page switches their own read (not a plain cross-dissolve).
const springy = springTiming({ config: { damping: 200, mass: 0.6, stiffness: 110 }, durationInFrames: TRANS });
const fadeT = linearTiming({ durationInFrames: TRANS });

export const JarvisDemo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Backdrop />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={DUR.intro}>
          <IntroBrownBee durationInFrames={DUR.intro} />
        </TransitionSeries.Sequence>

        {/* intro -> Today: a soft fade into the product */}
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        <TransitionSeries.Sequence durationInFrames={DUR.today}>
          <AppSection
            url="today"
            durationInFrames={DUR.today}
            footage={{ id: "today", label: "Today", page: "today", variant: "today", playbackRate: 1.02 }}
            captions={TODAY_CAPTIONS}
          />
        </TransitionSeries.Sequence>

        {/* Today -> Suggested: a gentle push up, one continuous scroll through the same page */}
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={springy} />

        <TransitionSeries.Sequence durationInFrames={DUR.suggested}>
          <AppSection
            url="today"
            durationInFrames={DUR.suggested}
            footage={{ id: "today", label: "Suggested", page: "today", variant: "today", trimStart: SUGGESTED_TRIM, playbackRate: 1.0 }}
            captions={SUGGESTED_CAPTIONS}
          />
        </TransitionSeries.Sequence>

        {/* Suggested -> Hero: a clean, calm fade into the live navigation (no flashy directional slide) */}
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        <TransitionSeries.Sequence durationInFrames={HERO.duration}>
          <AppSection
            url="today"
            durationInFrames={HERO.duration}
            footage={{ id: "hero", label: "Today", page: "today", variant: "today", trimStart: HERO.trimStart, playbackRate: HERO.playbackRate }}
            captions={HERO_CAPTIONS}
            clicks={HERO.clicks}
            urlSwitches={HERO.urlSwitches}
          />
        </TransitionSeries.Sequence>

        {/* Hero -> close: fade to the Otto sign-off */}
        <TransitionSeries.Transition presentation={fade()} timing={fadeT} />

        <TransitionSeries.Sequence durationInFrames={DUR.close}>
          <OutroOtto durationInFrames={DUR.close} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

/** Total composition length = sum of scene durations minus the 4 overlapping transitions. */
export const TOTAL_FRAMES = DUR.intro + DUR.today + DUR.suggested + HERO.duration + DUR.close - 4 * TRANS;

void fps;
