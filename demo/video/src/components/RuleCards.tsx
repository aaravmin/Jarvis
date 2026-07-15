import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme, font, shadow } from "../theme";

type Rule = { title: string; sub: string; icon: React.ReactNode };

const ic = (children: React.ReactNode) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
    {children}
  </svg>
);

const RULES: Rule[] = [
  {
    title: "Read-only scopes",
    sub: "Narrow OAuth. Tokens stay server-side.",
    icon: ic(
      <>
        <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" stroke={theme.accentStrong} strokeWidth="1.7" fill="none" />
        <path d="M9 12l2 2 4-4" stroke={theme.accentStrong} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Every item cites its source",
    sub: "A chip you can open, on every card.",
    icon: ic(
      <>
        <path d="M9 8h9M9 12h9M9 16h5" stroke={theme.accentStrong} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 7v10" stroke={theme.accentStrong} strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "Dates resolved by code, never the model",
    sub: "A parser, against the real timestamp.",
    icon: ic(
      <>
        <rect x="4" y="5" width="16" height="15" rx="3" stroke={theme.accentStrong} strokeWidth="1.7" />
        <path d="M4 9h16M8 3v4M16 3v4M12 12v4l2.5 1.5" stroke={theme.accentStrong} strokeWidth="1.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "You approve everything",
    sub: "Suggestions land in Review first.",
    icon: ic(
      <>
        <circle cx="12" cy="12" r="9" stroke={theme.accentStrong} strokeWidth="1.7" />
        <path d="M8 12.5l2.6 2.6L16 9.5" stroke={theme.accentStrong} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
];

// After the four cards flip in, a highlight steps through them one at a time so
// each card is a fresh ~20-frame beat (and the eye is guided to read each rule).
const EMPH_START = 60;
const EMPH_STEP = 20;

export const RuleCards: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardW = 468;
  const cardH = 236;
  const gap = 28;

  const activeCard = Math.floor((frame - EMPH_START) / EMPH_STEP);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: font.sans }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${cardW}px ${cardW}px`,
          gridTemplateRows: `${cardH}px ${cardH}px`,
          gap,
          perspective: 1600,
          marginTop: 40,
        }}
      >
        {RULES.map((r, i) => {
          const delay = 4 + i * 11;
          const flip = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.8, stiffness: 130 } });
          const rotateY = interpolate(flip, [0, 1], [78, 0]);
          const opacity = interpolate(flip, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          const num = String(i + 1).padStart(2, "0");

          // sequential highlight beat
          const emphIn = interpolate(
            frame,
            [EMPH_START + i * EMPH_STEP, EMPH_START + i * EMPH_STEP + 6],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const emphOut = interpolate(
            frame,
            [EMPH_START + i * EMPH_STEP + EMPH_STEP - 6, EMPH_START + i * EMPH_STEP + EMPH_STEP],
            [1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const emph = activeCard === i ? Math.min(emphIn, emphOut) : 0;
          const lift = emph * 8;
          const emphScale = 1 + emph * 0.03;
          return (
            <div
              key={i}
              style={{
                width: cardW,
                height: cardH,
                transform: `rotateY(${rotateY}deg) translateY(${-lift}px) scale(${emphScale})`,
                transformOrigin: "left center",
                opacity,
                background: theme.surface,
                border: `1px solid ${emph > 0.1 ? theme.accentStrong : theme.border}`,
                borderRadius: 22,
                boxShadow: emph > 0.1
                  ? `${shadow.cardLg}, 0 0 0 2px ${theme.accentStrong}`
                  : shadow.cardLg,
                padding: "30px 32px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                backfaceVisibility: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 15,
                    background: theme.surface3,
                    border: `1px solid ${theme.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {r.icon}
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: theme.borderStrong, letterSpacing: 1 }}>
                  {num}
                </span>
              </div>
              <div style={{ fontSize: 27, fontWeight: 700, color: theme.foreground, lineHeight: 1.18, letterSpacing: -0.3 }}>
                {r.title}
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, color: theme.muted, lineHeight: 1.3 }}>
                {r.sub}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
