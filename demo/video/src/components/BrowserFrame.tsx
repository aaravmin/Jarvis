import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme, font, shadow } from "../theme";

export type Pan = { x: number; y: number };

type Props = {
  url: string; // path after localhost:3000/, e.g. "today"
  sceneDuration: number; // frames, for the continuous scale push
  zoom?: { from: number; to: number };
  pan?: Pan; // normalized -1..1 Ken-Burns drift target (fraction of a subtle range)
  panEase?: number; // 0..1 how far into the scene the pan completes
  radius?: number;
  children: React.ReactNode;
};

/**
 * Every clip lives inside this browser chrome: rounded 16 window, monochrome
 * window dots (neutral ink only), a URL pill, soft drop shadow, and a subtle
 * continuous scale push (Ken-Burns) toward the region a callout points at.
 */
export const BrowserFrame: React.FC<Props> = ({
  url,
  sceneDuration,
  zoom = { from: 1.0, to: 1.05 },
  pan = { x: 0, y: 0 },
  panEase = 1,
  radius = 16,
  children,
}) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, sceneDuration], [zoom.from, zoom.to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const panProgress = interpolate(
    frame,
    [0, Math.max(1, sceneDuration * panEase)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => t * t * (3 - 2 * t) }
  );
  const panRange = 46; // px of drift at most; keeps it tasteful
  const tx = pan.x * panRange * panProgress;
  const ty = pan.y * panRange * panProgress;

  const barH = 46;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: radius,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        boxShadow: shadow.float,
        overflow: "hidden",
      }}
    >
      {/* top chrome bar */}
      <div
        style={{
          position: "relative",
          height: barH,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 16px",
          background: "linear-gradient(#fcfdfe, #f4f6f8)",
          borderBottom: `1px solid ${theme.border}`,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: theme.borderStrong,
                boxShadow: "inset 0 0 0 1px rgba(16,24,40,0.04)",
              }}
            />
          ))}
        </div>

        {/* URL pill */}
        <div
          style={{
            flex: 1,
            maxWidth: 460,
            marginLeft: 6,
            height: 28,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            borderRadius: 999,
            background: theme.surface3,
            border: `1px solid ${theme.border}`,
            color: theme.muted,
            fontFamily: font.sans,
            fontSize: 13,
            letterSpacing: 0.1,
          }}
        >
          {/* small lock glyph */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="5" y="10" width="14" height="10" rx="2.5" fill={theme.muted} />
            <path
              d="M8 10V8a4 4 0 018 0v2"
              stroke={theme.muted}
              strokeWidth="2"
              fill="none"
            />
          </svg>
          <span style={{ color: theme.mutedStrong }}>localhost:3000</span>
          <span style={{ color: theme.muted }}>/{url}</span>
        </div>
      </div>

      {/* viewport with scale-push + pan */}
      <div
        style={{
          position: "absolute",
          top: barH,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
          background: theme.background,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
