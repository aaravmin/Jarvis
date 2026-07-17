import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { clamp01, pageToView, smoother, APP_SCALE, type Focus } from "../motion";
import { resolveZoom, viewPointToComp, type FxClick } from "./ClickFx";

/**
 * A pointing target: a highlight RING drawn tightly around one on-screen element, plus a CONNECTOR line
 * (with an arrowhead) from the caption's corner up to that element - so every caption visibly points at
 * the exact thing it describes. Authored in PAGE space (1920x1080, measured off the still/footage); the
 * ring tracks the element through the focus/click zoom via the shared `resolveZoom`, so it stays glued to
 * the element as the footage zooms in and back out.
 */
export type PointTarget = {
  pageX: number; // element center (page space)
  pageY: number;
  w: number; // element size (page px) - the ring hugs this box
  h: number;
  from: number; // scene-relative frame the pointer appears (match the caption)
  dur: number; // frames on screen
  // ring + connector color. red = urgent, green = done, goal = the caramel brand accent used for the
  // goal-spine highlights (never a status), ink = neutral.
  accent?: "ink" | "red" | "green" | "goal";
  pad?: number; // extra ring padding (px, comp space at scale 1)
  /** connector origin in COMP space (near the caption). Defaults to just above the bottom-left caption. */
  anchorX?: number;
  anchorY?: number;
};

const ACCENT = (a: PointTarget["accent"]): string =>
  a === "red" ? theme.danger : a === "green" ? theme.success : a === "goal" ? theme.caramel : theme.accentStrong;

/** One ring + connector, shown for [from, from+dur], easing in/out; tracks the live zoom. */
const OnePointer: React.FC<{
  t: PointTarget;
  clicks: FxClick[];
  focuses: Focus[];
  sceneDuration: number;
  idle: boolean;
}> = ({ t, clicks, focuses, sceneDuration, idle }) => {
  const frame = useCurrentFrame();
  const local = frame - t.from;
  if (local < 0 || local > t.dur) return null;

  // Ease the pointer in (draws on) and out, so it never hard-cuts against the caption.
  const inO = smoother(clamp01(local / 12));
  const outO = 1 - smoother(clamp01((local - (t.dur - 12)) / 12));
  const appear = Math.min(inO, outO);

  // Element center + size in view space, then mapped through the CURRENT zoom into comp space.
  const z = resolveZoom(frame, clicks, focuses, sceneDuration, idle);
  const v = pageToView(t.pageX, t.pageY);
  const c = viewPointToComp(v.x, v.y, z);
  const pad = t.pad ?? 10;
  const halfW = (t.w * APP_SCALE * z.scale) / 2 + pad;
  const halfH = (t.h * APP_SCALE * z.scale) / 2 + pad;
  const color = ACCENT(t.accent);

  // A gentle "breathing" so the ring reads as a live highlight, not a static box.
  const breathe = 1 + 0.02 * Math.sin(local / 7);
  const rw = halfW * 2 * breathe;
  const rh = halfH * 2 * breathe;
  const radius = Math.min(rh / 2, 14);

  // Connector: from the caption anchor to the point on the ring's edge nearest the anchor.
  const ax = t.anchorX ?? 360;
  const ay = t.anchorY ?? 910;
  const dx = ax - c.x;
  const dy = ay - c.y;
  const adx = Math.max(1, Math.abs(dx));
  const ady = Math.max(1, Math.abs(dy));
  const tt = Math.min((rw / 2) / adx, (rh / 2) / ady); // ray/rect intersection toward the anchor
  const edgeX = c.x + dx * tt;
  const edgeY = c.y + dy * tt;
  // Draw the line from the anchor to just shy of the ring edge; arrowhead points into the element.
  const gap = 7;
  const len = Math.hypot(edgeX - ax, edgeY - ay);
  const ux = (edgeX - ax) / (len || 1);
  const uy = (edgeY - ay) / (len || 1);
  const tipX = edgeX - ux * gap;
  const tipY = edgeY - uy * gap;
  // Line grows from the anchor toward the element as it appears.
  const grow = smoother(clamp01(local / 16));
  const lineX = ax + (tipX - ax) * grow;
  const lineY = ay + (tipY - ay) * grow;
  // Arrowhead
  const ah = 11;
  const perpX = -uy;
  const perpY = ux;
  const arrow = `${tipX},${tipY} ${tipX - ux * ah + perpX * ah * 0.55},${tipY - uy * ah + perpY * ah * 0.55} ${tipX - ux * ah - perpX * ah * 0.55},${tipY - uy * ah - perpY * ah * 0.55}`;
  const arrowShown = grow > 0.85;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: appear }}>
      {/* highlight ring, hugging the element (tracks the zoom) */}
      <div
        style={{
          position: "absolute",
          left: c.x - rw / 2,
          top: c.y - rh / 2,
          width: rw,
          height: rh,
          borderRadius: radius,
          border: `2.5px solid ${color}`,
          boxShadow: `0 0 0 4px ${color}22, 0 6px 18px rgba(16,24,40,0.12)`,
          background: `${color}0d`,
        }}
      />
      {/* connector line + arrowhead + a small anchor dot at the caption */}
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0 }}>
        <line x1={ax} y1={ay} x2={lineX} y2={lineY} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={ax} cy={ay} r={4} fill={color} />
        {arrowShown && <polygon points={arrow} fill={color} />}
      </svg>
    </AbsoluteFill>
  );
};

/** All pointing targets for a scene. Rendered above the browser frame, below the caption text. */
export const Pointer: React.FC<{
  targets: PointTarget[];
  clicks?: FxClick[];
  focuses?: Focus[];
  sceneDuration: number;
  idle?: boolean;
}> = ({ targets, clicks = [], focuses = [], sceneDuration, idle = false }) => {
  return (
    <>
      {targets.map((t, i) => (
        <OnePointer key={i} t={t} clicks={clicks} focuses={focuses} sceneDuration={sceneDuration} idle={idle} />
      ))}
    </>
  );
};
