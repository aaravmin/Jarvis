import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { ClickRipple } from "./ClickRipple";
import { DoneStamp } from "./DoneStamp";
import { clamp01, navPush, pulse, smoother, VIEW_W, VIEW_H } from "../motion";

export type FxKind = "nav" | "check" | "tap";
export type FxClick = {
  frame: number; // scene-relative frame of the click
  x: number; // view-local px (inside the browser frame)
  y: number;
  kind: FxKind;
  stampDelay?: number; // check only: frames after the click the green "done" stamp lands
};

const K_CHECK = 1.27;
const K_TAP = 1.18;
const CHECK_ENV = { pre: 3, rise: 12, hold: 54, fall: 20 };
const TAP_ENV = { pre: 2, rise: 10, hold: 26, fall: 16 };

/** Scale contribution of a single click at the given frame (1 = no zoom). */
function clickScale(frame: number, c: FxClick): number {
  if (c.kind === "nav") return navPush(frame, c.frame);
  if (c.kind === "check") return 1 + (K_CHECK - 1) * pulse(frame, c.frame, CHECK_ENV);
  return 1 + (K_TAP - 1) * pulse(frame, c.frame, TAP_ENV);
}

/** A caramel light band sweeping across the screen on a nav click - punctuates the real page switch. */
function NavSweep({ c }: { c: FxClick }) {
  const frame = useCurrentFrame();
  const t = frame - c.frame;
  const LEN = 18;
  if (t < 0 || t > LEN) return null;
  const p = t / LEN;
  const tx = -0.45 * VIEW_W + 1.9 * VIEW_W * smoother(p); // sweep left -> right
  const opacity = (t < 4 ? t / 4 : 1 - clamp01((t - 4) / (LEN - 4))) * 0.9;
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: VIEW_W * 0.5,
          transform: `translateX(${tx}px) skewX(-12deg)`,
          background: `linear-gradient(90deg, transparent, ${theme.caramel}2e 45%, ${theme.caramelSoft}22 55%, transparent)`,
          opacity,
        }}
      />
    </AbsoluteFill>
  );
}

/**
 * Wraps the framed footage with the click-driven motion: a zoom that eases toward whichever click is
 * active (springy in, hold, ease back), a caramel ripple at every click, a green "done" stamp on
 * check-offs, and a caramel sweep punctuating each nav/page switch. When `clicks` is empty it applies a
 * calm idle drift so still surfaces still breathe.
 */
export const ClickFx: React.FC<{
  clicks: FxClick[];
  sceneDuration: number;
  idle?: boolean;
  children: React.ReactNode;
}> = ({ clicks, sceneDuration, idle = true, children }) => {
  const frame = useCurrentFrame();

  // Pick the strongest active click's zoom + origin; fall back to a slow center idle drift.
  let scale = 1;
  let ox = VIEW_W / 2;
  let oy = VIEW_H / 2;
  let strength = 0;
  for (const c of clicks) {
    const s = clickScale(frame, c);
    const st = Math.abs(s - 1);
    if (st > strength) {
      strength = st;
      scale = s;
      ox = c.x;
      oy = c.y;
    }
  }
  if (strength < 0.0008 && clicks.length === 0 && idle) {
    scale = 1 + 0.016 * smoother(clamp01(frame / sceneDuration));
  }

  const checks = clicks.filter((c) => c.kind === "check");
  const navs = clicks.filter((c) => c.kind === "nav");

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {/* zoomed content: footage + glued FX (ripples, done stamp track the pixels they point at) */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${ox}px ${oy}px`,
          willChange: "transform",
        }}
      >
        {children}
        {clicks.map((c, i) => (
          <ClickRipple key={`r${i}`} x={c.x} y={c.y} start={c.frame} />
        ))}
        {checks.map((c, i) => (
          <DoneStamp
            key={`d${i}`}
            x={c.x}
            y={c.y}
            start={c.frame + (c.stampDelay ?? 34)}
            fadeStart={c.frame + CHECK_ENV.rise + CHECK_ENV.hold - 2}
          />
        ))}
      </AbsoluteFill>

      {/* screen-space page-switch sweeps (do not zoom with the content) */}
      {navs.map((c, i) => (
        <NavSweep key={`s${i}`} c={c} />
      ))}
    </AbsoluteFill>
  );
};
