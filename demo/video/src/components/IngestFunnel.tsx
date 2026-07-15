import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font, shadow } from "../theme";

/**
 * SC4 signature animation. Three source cards (Gmail / Calendar / Notion), each
 * carrying a real seed snippet, emit candidate tokens that glide along bezier
 * paths into a central J badge. A counter ticks to "9 candidates". A verify gate
 * then keeps 6 (green) and bounces 3 off (red fade): "6 verified - quotes checked
 * against the source".
 *
 * Source glyphs are neutral ink on purpose: red is reserved here for the rejected
 * tokens and green for the verified ones, so the sort reads unambiguously.
 */

type Src = { key: string; label: string; snippet: string; glyph: React.ReactNode };

const SRC_X = 196;
const SRC_W = 452;
const SRC_H = 100;
const SRC_Y = [352, 500, 648];

const J_CX = 1168;
const J_CY = 512;
const J_SIZE = 156;

const EnvelopeGlyph = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="14" rx="3" stroke={theme.mutedStrong} strokeWidth="1.8" />
    <path d="M4 7l8 6 8-6" stroke={theme.mutedStrong} strokeWidth="1.8" fill="none" />
  </svg>
);
const CalendarGlyph = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3.5" y="5" width="17" height="15" rx="3" stroke={theme.mutedStrong} strokeWidth="1.8" />
    <path d="M3.5 9h17M8 3v4M16 3v4" stroke={theme.mutedStrong} strokeWidth="1.8" />
  </svg>
);
const NotionGlyph = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="3.5" width="16" height="17" rx="2.4" stroke={theme.mutedStrong} strokeWidth="1.8" />
    <path d="M8 8h8M8 12h8M8 16h5" stroke={theme.mutedStrong} strokeWidth="1.8" />
  </svg>
);

const SOURCES: Src[] = [
  {
    key: "gmail",
    label: "Gmail",
    snippet: "send wholesale pricing for the fall blends",
    glyph: EnvelopeGlyph,
  },
  {
    key: "calendar",
    label: "Calendar",
    snippet: "Cupping with Fern Cafe - today 3:00",
    glyph: CalendarGlyph,
  },
  {
    key: "notion",
    label: "Notion",
    snippet: "raise wholesale minimum to 20 lbs",
    glyph: NotionGlyph,
  },
];

// 9 tokens, 3 per source. `ok:false` are the 3 that fail verification.
// Rapid cadence: a token arrives at the badge roughly every 7 frames.
type Token = { src: number; spawn: number; travel: number; ok: boolean; slot: number };
const REJECT = new Set([2, 4, 7]);
const TOKENS: Token[] = Array.from({ length: 9 }).map((_, i) => {
  const src = i % 3;
  const spawn = 16 + i * 7;
  return { src, spawn, travel: 26, ok: !REJECT.has(i), slot: i };
});

const bezier = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number
): [number, number] => {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
};

// timeline anchors (rapid re-cut: tokens land ~16-98, gate/sort/stamp 104-166)
const GATE_START = 104;
const SORT_START = 116;
const STAMP_START = 150;

export const IngestFunnel: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // count candidates that have arrived at J
  const arrived = TOKENS.filter((t) => frame >= t.spawn + t.travel).length;

  const jSpring = spring({ frame: frame - 8, fps, config: { damping: 200, mass: 0.7, stiffness: 150 } });
  const jScale = interpolate(jSpring, [0, 1], [0.6, 1]);

  // J pulse each time a token arrives
  const lastArrival = TOKENS.filter((t) => frame >= t.spawn + t.travel)
    .map((t) => t.spawn + t.travel)
    .reduce((a, b) => Math.max(a, b), -999);
  const sincePulse = frame - lastArrival;
  const pulse = sincePulse >= 0 && sincePulse < 12 ? Math.sin((sincePulse / 12) * Math.PI) * 0.06 : 0;

  const verifiedCount = TOKENS.filter((t) => t.ok).length;

  return (
    <AbsoluteFill style={{ fontFamily: font.sans }}>
      {/* connective faint guide lines from each source to J */}
      <svg width="1920" height="1080" style={{ position: "absolute", inset: 0 }}>
        {SOURCES.map((_, i) => {
          const p0: [number, number] = [SRC_X + SRC_W, SRC_Y[i] + SRC_H / 2];
          const p2: [number, number] = [J_CX - J_SIZE / 2, J_CY];
          const p1: [number, number] = [(p0[0] + p2[0]) / 2 + 40, (p0[1] + p2[1]) / 2 + (i - 1) * 40];
          const path = `M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={theme.borderStrong}
              strokeWidth={1.5}
              strokeDasharray="2 8"
              strokeOpacity={interpolate(frame, [8, 22], [0, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            />
          );
        })}
      </svg>

      {/* source cards */}
      {SOURCES.map((s, i) => {
        const sp = spring({ frame: frame - i * 4, fps, config: { damping: 200, mass: 0.7, stiffness: 150 } });
        const x = interpolate(sp, [0, 1], [-60, 0]);
        return (
          <div
            key={s.key}
            style={{
              position: "absolute",
              left: SRC_X + x,
              top: SRC_Y[i],
              width: SRC_W,
              height: SRC_H,
              opacity: sp,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              boxShadow: shadow.card,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 20px",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: theme.surface3,
                border: `1px solid ${theme.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {s.glyph}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.6, color: theme.muted, textTransform: "uppercase" }}>
                {s.label}
              </div>
              <div
                style={{
                  fontSize: 16.5,
                  fontWeight: 500,
                  color: theme.mutedStrong,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: SRC_W - 96,
                }}
              >
                &ldquo;{s.snippet}&rdquo;
              </div>
            </div>
          </div>
        );
      })}

      {/* travelling candidate tokens */}
      {TOKENS.map((tok, i) => {
        const p0: [number, number] = [SRC_X + SRC_W - 8, SRC_Y[tok.src] + SRC_H / 2];
        const p2: [number, number] = [J_CX, J_CY];
        const p1: [number, number] = [(p0[0] + p2[0]) / 2 + 30, (p0[1] + p2[1]) / 2 + (tok.src - 1) * 46];
        const local = frame - tok.spawn;
        if (local < 0 || local > tok.travel) return null;
        const t = interpolate(local, [0, tok.travel], [0, 1], { easing: (x) => x * x * (3 - 2 * x) });
        const [px, py] = bezier(p0, p1, p2, t);
        const appear = interpolate(local, [0, 6], [0, 1], { extrapolateRight: "clamp" });
        const vanish = interpolate(local, [tok.travel - 8, tok.travel], [1, 0], { extrapolateLeft: "clamp" });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              transform: "translate(-50%, -50%)",
              width: 16,
              height: 16,
              borderRadius: 999,
              background: theme.accent,
              boxShadow: "0 2px 8px rgba(51,65,85,0.35)",
              opacity: Math.min(appear, vanish),
            }}
          />
        );
      })}

      {/* central J badge */}
      <div
        style={{
          position: "absolute",
          left: J_CX - J_SIZE / 2,
          top: J_CY - J_SIZE / 2,
          width: J_SIZE,
          height: J_SIZE,
          transform: `scale(${jScale + pulse})`,
          borderRadius: 34,
          background: `linear-gradient(160deg, ${theme.accent}, ${theme.accentStrong})`,
          boxShadow: `0 20px 60px rgba(30,41,59,0.35), 0 0 0 ${8 + pulse * 120}px rgba(51,65,85,${0.05})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        G
      </div>

      {/* counter chip under J */}
      <div
        style={{
          position: "absolute",
          left: J_CX,
          top: J_CY + J_SIZE / 2 + 26,
          transform: "translateX(-50%)",
          opacity: interpolate(frame, [24, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 18px",
          borderRadius: 999,
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          boxShadow: shadow.card,
          fontSize: 20,
          fontWeight: 700,
          color: theme.foreground,
        }}
      >
        <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 26, textAlign: "right" }}>{arrived}</span>
        <span style={{ color: theme.muted, fontWeight: 600 }}>candidates</span>
      </div>

      {/* verify gate sweep */}
      {frame >= GATE_START ? <GateAndSort frame={frame} verifiedCount={verifiedCount} /> : null}
    </AbsoluteFill>
  );
};

const VERIFIED_SLOTS = 6;

const GateAndSort: React.FC<{ frame: number; verifiedCount: number }> = ({ frame, verifiedCount }) => {
  // sweep bar
  const sweep = interpolate(frame, [GATE_START, GATE_START + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const sweepX = interpolate(sweep, [0, 1], [J_CX - 40, 1560]);
  const sweepOpacity = interpolate(frame, [GATE_START, GATE_START + 9, GATE_START + 26], [0, 0.9, 0]);

  // verified grid to the right of J
  const gridX = 1420;
  const gridY = 360;
  const cell = 96;
  const gap = 16;

  return (
    <>
      {/* sweep line */}
      <div
        style={{
          position: "absolute",
          left: sweepX,
          top: J_CY - 150,
          width: 4,
          height: 300,
          borderRadius: 999,
          background: theme.accent,
          opacity: sweepOpacity,
          boxShadow: `0 0 24px 4px rgba(51,65,85,0.25)`,
        }}
      />

      {/* 6 verified tiles */}
      {Array.from({ length: VERIFIED_SLOTS }).map((_, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const appear = interpolate(frame, [SORT_START + i * 5, SORT_START + i * 5 + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: (t) => 1 - Math.pow(1 - t, 3),
        });
        const fromX = J_CX;
        const fromY = J_CY;
        const toX = gridX + col * (cell + gap);
        const toY = gridY + row * (cell + gap);
        const x = interpolate(appear, [0, 1], [fromX, toX]);
        const y = interpolate(appear, [0, 1], [fromY, toY]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: cell,
              height: cell,
              transform: `translate(-50%,-50%) scale(${0.6 + appear * 0.4})`,
              opacity: appear,
              borderRadius: 18,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              boxShadow: shadow.card,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="11" fill={theme.successSoft} />
              <path d="M7 12.5l3.2 3.2L17 9" stroke={theme.success} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        );
      })}

      {/* 3 rejected tokens bounce off + red fade */}
      {[0, 1, 2].map((i) => {
        const t = interpolate(frame, [SORT_START + 3 + i * 4, SORT_START + 26 + i * 4], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: (x) => x * x,
        });
        const x = interpolate(t, [0, 1], [J_CX, J_CX - 120 - i * 40]);
        const y = interpolate(t, [0, 1], [J_CY, J_CY + 260 + i * 30]);
        const opacity = interpolate(t, [0, 0.2, 1], [0, 1, 0]);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `translate(-50%,-50%) rotate(${t * 90}deg)`,
              width: 44,
              height: 44,
              borderRadius: 12,
              background: theme.dangerSoft,
              border: `1.5px solid ${theme.danger}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M7 7l10 10M17 7L7 17" stroke={theme.danger} strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </div>
        );
      })}

      {/* verified stamp */}
      {frame >= STAMP_START ? <VerifiedStamp frame={frame} count={verifiedCount} /> : null}
    </>
  );
};

const VerifiedStamp: React.FC<{ frame: number; count: number }> = ({ frame, count }) => {
  const s = interpolate(frame, [STAMP_START, STAMP_START + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const scale = interpolate(s, [0, 1], [0.86, 1]);
  return (
    <div
      style={{
        position: "absolute",
        left: 1168,
        top: 760,
        transform: `translateX(-50%) scale(${scale})`,
        opacity: s,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 26px",
        borderRadius: 16,
        background: theme.surface,
        border: `1.5px solid ${theme.success}`,
        boxShadow: `0 12px 40px rgba(22,163,74,0.18)`,
      }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill={theme.success} />
        <path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: theme.foreground }}>
          {count} verified
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: theme.muted }}>
          quotes checked against the source
        </div>
      </div>
    </div>
  );
};
