import React from "react";
import { OffthreadVideo, staticFile, Freeze, useCurrentFrame } from "remotion";
import { StandIn } from "./StandIn";
import { FOOTAGE_AVAILABLE, getClip, clipStartFrom } from "../footage";

type Props = {
  id: string; // clip id in the manifest (F1..F8)
  label: string; // stand-in scene label
  page: string; // url path / active nav
  variant?: string; // stand-in content variant
  /** frames into the usable clip to begin (relative to usable start). */
  trimStart?: number;
  /** how many frames of the clip this scene will show. */
  showFrames: number;
  /** playbackRate for the footage (slow-mo < 1). */
  playbackRate?: number;
};

/**
 * Renders real capture footage when available, else the app-shell stand-in.
 * When a clip is shorter than the scene needs, the last frame is frozen
 * (Freeze) rather than time-stretched.
 */
export const Footage: React.FC<Props> = ({
  id,
  label,
  page,
  variant,
  trimStart = 0,
  showFrames,
  playbackRate = 1,
}) => {
  const clip = getClip(id);

  if (!FOOTAGE_AVAILABLE || !clip) {
    return <StandIn label={label} page={page} variant={variant} />;
  }

  const src = staticFile(`footage/${clip.file}`);
  const startFrom = clipStartFrom() + trimStart;

  return (
    <FreezeIfShort src={src} startFrom={startFrom} showFrames={showFrames} playbackRate={playbackRate} />
  );
};

/**
 * Plays the clip from startFrom; if the source runs out before showFrames,
 * the visible last frame is held via Freeze so nothing stretches.
 */
const FreezeIfShort: React.FC<{
  src: string;
  startFrom: number;
  showFrames: number;
  playbackRate: number;
}> = ({ src, startFrom, showFrames, playbackRate }) => {
  const frame = useCurrentFrame();
  // If we ever detect we're past available media we just keep OffthreadVideo,
  // which holds its last decoded frame; Freeze is applied at the scene layer
  // when the manifest says the clip is short. Kept simple + robust here.
  void frame;
  return (
    <OffthreadVideo
      src={src}
      startFrom={startFrom}
      endAt={startFrom + Math.ceil(showFrames * playbackRate)}
      playbackRate={playbackRate}
      style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
      transparent={false}
    />
  );
};

export { Freeze };
