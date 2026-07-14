import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "../theme";

/**
 * The persistent app canvas. Rendered behind every scene so scene-to-scene
 * fades dissolve through a consistent surface instead of flashing to black.
 * Mirrors globals.css `.app-ambient`: faint slate radial washes on near-white.
 */
export const Backdrop: React.FC<{ vignette?: boolean }> = ({ vignette = true }) => {
  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(60rem 40rem at 12% -10%, rgba(51, 65, 85, 0.05), transparent 60%),
          radial-gradient(50rem 40rem at 100% 0%, rgba(30, 41, 59, 0.035), transparent 55%),
          ${theme.background}
        `,
      }}
    >
      {vignette ? (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(16,24,40,0.05) 100%)",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
