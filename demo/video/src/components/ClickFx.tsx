import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { ClickRipple } from "./ClickRipple";
import { DoneStamp } from "./DoneStamp";
import { clamp01, focusScale, navPush, pulse, smoother, VIEW_W, VIEW_H, type Focus } from "../motion";

export type FxKind = "nav" | "check" | "tap";
/** Optional explicit status color; otherwise derived from kind (check -> green, else neutral). */
export type FxTone = "green" | "red" | "neutral";
export type FxClick = {
  frame: number; // scene-relative frame of the click
  x: number; // view-local px (inside the browser frame)
  y: number;
  kind: FxKind;
  tone?: FxTone;
  stampDelay?: number; // check only: frames after the click the green "done" stamp lands
};

// Gentle zoom-on-click (dialed back so a check-off no longer crops the left nav rail): a small push
// on the check, a barely-there push on a tap, and a soft recoil on a nav click.
const K_CHECK = 1.06;
const K_TAP = 1.05;
const CHECK_ENV = { pre: 3, rise: 14, hold: 52, fall: 24 };
const TAP_ENV = { pre: 2, rise: 12, hold: 26, fall: 18 };

function toneOf(c: FxClick): FxTone {
  return c.tone ?? (c.kind === "check" ? "green" : "neutral");
}
function toneColor(c: FxClick): string {
  const t = toneOf(c);
  return t === "green" ? theme.success : t === "red" ? theme.danger : theme.ink;
}
/** Neutral (nav) pulses are smaller + softer than a green completion pulse. */
function toneStrength(c: FxClick): number {
  return toneOf(c) === "neutral" ? 0.62 : 1;
}

/** Scale contribution of a single click at the given frame (1 = no zoom). */
function clickScale(frame: number, c: FxClick): number {
  if (c.kind === "nav") return navPush(frame, c.frame);
  if (c.kind === "check") return 1 + (K_CHECK - 1) * pulse(frame, c.frame, CHECK_ENV);
  return 1 + (K_TAP - 1) * pulse(frame, c.frame, TAP_ENV);
}

/** A soft, neutral light band that gently glides across on a nav click - a subtle punctuation of the
 * real page switch, not the old flashy caramel sweep. */
function NavSweep({ c }: { c: FxClick }) {
  const frame = useCurrentFrame();
  const t = frame - c.frame;
  const LEN = 20;
  if (t < 0 || t > LEN) return null;
  const p = t / LEN;
  const tx = -0.4 * VIEW_W + 1.8 * VIEW_W * smoother(p); // glide left -> right
  const opacity = (t < 5 ? t / 5 : 1 - clamp01((t - 5) / (LEN - 5))) * 0.4;
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: VIEW_W * 0.42,
          transform: `translateX(${tx}px) skewX(-10deg)`,
          background: "linear-gradient(90deg, transparent, rgba(148,163,184,0.16) 50%, transparent)",
          opacity,
        }}
      />
    </AbsoluteFill>
  );
}

/**
 * Wraps the framed footage with two kinds of motion:
 *  - FOCUS + CONTEXT (scripted to captions): eases from the full dashboard into a specific element,
 *    holds, then eases back out (the `focuses` prop). This is the spine of the app scenes.
 *  - CLICK-DRIVEN (synced to real clicks): a gentle zoom toward the active click, ONE clean
 *    status-colored pulse at every click, a green "done" stamp on check-offs, and a subtle neutral
 *    sweep punctuating each page switch (the `clicks` prop, used by the loop scene).
 * A scene uses one or the other; whichever deviates from scale 1 more at a given frame wins the zoom.
 * When neither is active it applies a calm idle drift so still surfaces still breathe.
 */
export const ClickFx: React.FC<{
  clicks: FxClick[];
  focuses?: Focus[];
  sceneDuration: number;
  idle?: boolean;
  children: React.ReactNode;
}> = ({ clicks, focuses = [], sceneDuration, idle = true, children }) => {
  const frame = useCurrentFrame();

  // Pick the strongest active zoom (focus target or click) + its origin; fall back to a slow idle drift.
  let scale = 1;
  let ox = VIEW_W / 2;
  let oy = VIEW_H / 2;
  let strength = 0;
  for (const f of focuses) {
    const s = focusScale(frame, f);
    const st = Math.abs(s - 1);
    if (st > strength) {
      strength = st;
      scale = s;
      ox = f.x;
      oy = f.y;
    }
  }
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
  if (strength < 0.0008 && clicks.length === 0 && focuses.length === 0 && idle) {
    scale = 1 + 0.012 * smoother(clamp01(frame / sceneDuration));
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
          <ClickRipple key={`r${i}`} x={c.x} y={c.y} start={c.frame} tint={toneColor(c)} strength={toneStrength(c)} />
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
