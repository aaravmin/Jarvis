import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font, shadow } from "../theme";

export type Region = { x: number; y: number; w: number; h: number };
export type Placement = "top" | "bottom" | "left" | "right";
export type CalloutColor = "ink" | "red" | "green";

type Props = {
  region: Region; // composition-space box to ring
  label: string;
  placement?: Placement;
  color?: CalloutColor;
  durationInFrames: number; // this callout's own sequence length, for exit timing
  radius?: number; // ring corner radius
  pillOffset?: number; // distance from ring to pill along the connector
  ringPad?: number; // padding added around the region
};

const colorOf = (c: CalloutColor) =>
  c === "red" ? theme.danger : c === "green" ? theme.success : theme.accentStrong;

export const Callout: React.FC<Props> = ({
  region,
  label,
  placement = "top",
  color = "ink",
  durationInFrames,
  radius = 14,
  pillOffset = 26,
  ringPad = 10,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ring = colorOf(color);
  const rx = region.x - ringPad;
  const ry = region.y - ringPad;
  const rw = region.w + ringPad * 2;
  const rh = region.h + ringPad * 2;

  // --- entrance / draw (rapid: ring snaps in ~8f, pill springs ~by f12) ---
  const draw = interpolate(frame, [1, 9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const ringOpacity = interpolate(frame, [0, 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pillSpring = spring({
    frame: frame - 3,
    fps,
    config: { damping: 200, mass: 0.6, stiffness: 190 },
  });

  // --- exit (fast cut: last 5 frames) ---
  const exitStart = durationInFrames - 5;
  const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // pill anchor + connector geometry
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  let anchorX = cx;
  let anchorY = ry; // ring edge point the connector starts from
  let pillX = cx;
  let pillY = ry - pillOffset;
  let pillTransformOrigin = "center bottom";
  let pillTranslate = "translate(-50%, -100%)";

  if (placement === "top") {
    anchorX = cx;
    anchorY = ry;
    pillX = cx;
    pillY = ry - pillOffset;
    pillTranslate = "translate(-50%, -100%)";
    pillTransformOrigin = "center bottom";
  } else if (placement === "bottom") {
    anchorX = cx;
    anchorY = ry + rh;
    pillX = cx;
    pillY = ry + rh + pillOffset;
    pillTranslate = "translate(-50%, 0)";
    pillTransformOrigin = "center top";
  } else if (placement === "left") {
    anchorX = rx;
    anchorY = cy;
    pillX = rx - pillOffset;
    pillY = cy;
    pillTranslate = "translate(-100%, -50%)";
    pillTransformOrigin = "right center";
  } else {
    anchorX = rx + rw;
    anchorY = cy;
    pillX = rx + rw + pillOffset;
    pillY = cy;
    pillTranslate = "translate(0, -50%)";
    pillTransformOrigin = "left center";
  }

  const connectorLen = pillOffset * draw;
  const connEndX = anchorX + (pillX - anchorX) * (connectorLen / Math.max(1, pillOffset));
  const connEndY = anchorY + (pillY - anchorY) * (connectorLen / Math.max(1, pillOffset));

  const pillScale = 0.9 + pillSpring * 0.1;
  const pillDrift = (1 - pillSpring) * (placement === "top" ? 8 : placement === "bottom" ? -8 : 0);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: exit }}>
      {/* ring + connector as one SVG in comp space */}
      <svg
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {/* soft outer glow ring */}
        <rect
          x={rx}
          y={ry}
          width={rw}
          height={rh}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={ring}
          strokeOpacity={0.14 * ringOpacity}
          strokeWidth={10}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
        {/* crisp self-drawing ring */}
        <rect
          x={rx}
          y={ry}
          width={rw}
          height={rh}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={ring}
          strokeOpacity={ringOpacity}
          strokeWidth={3}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
        {/* connector */}
        <line
          x1={anchorX}
          y1={anchorY}
          x2={connEndX}
          y2={connEndY}
          stroke={ring}
          strokeWidth={2}
          strokeOpacity={0.85 * ringOpacity}
        />
        <circle cx={anchorX} cy={anchorY} r={3.5} fill={ring} fillOpacity={ringOpacity} />
      </svg>

      {/* pill label */}
      <div
        style={{
          position: "absolute",
          left: pillX,
          top: pillY + pillDrift,
          transform: `${pillTranslate} scale(${pillScale})`,
          transformOrigin: pillTransformOrigin,
          opacity: pillSpring,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderRadius: 12,
          background: theme.inkStrong,
          color: "#ffffff",
          fontFamily: font.sans,
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: 0.1,
          lineHeight: 1.15,
          boxShadow: shadow.cardLg,
          maxWidth: 520,
          whiteSpace: "nowrap",
        }}
      >
        {color !== "ink" ? (
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: ring,
              flexShrink: 0,
              boxShadow: `0 0 0 3px ${color === "red" ? "rgba(220,38,38,0.22)" : "rgba(22,163,74,0.22)"}`,
            }}
          />
        ) : null}
        <span>{label}</span>
      </div>
    </div>
  );
};
