import React from "react";
import { Img, OffthreadVideo, staticFile } from "remotion";
import { StandIn } from "./StandIn";
import { FOOTAGE_AVAILABLE, getClip, clipStartFrom } from "../footage";
import { fps } from "../theme";

// OffthreadVideo renders blank for the ~1s of source that sits right against `endAt` (observed on these
// Playwright webms). So we set endAt a couple seconds PAST the last frame we actually show - the extra
// range is only ever decoded, never displayed - capped just inside the clip's real length so we never
// point endAt beyond decodable footage. This keeps every SHOWN frame clear of that boundary artifact.
const DECODE_TAIL_BUFFER = 60; // frames of extra decode headroom beyond the last shown frame

type Props = {
  id: string; // clip id in the manifest (F1..F8)
  label: string; // stand-in scene label
  page: string; // url path / active nav
  variant?: string; // stand-in content variant
  /** a STILL frame (public/stills/<file>) instead of video - for the near-static focus scenes, which
   * are examined with a focus+context zoom and don't need playback. Avoids the OffthreadVideo blank-tail
   * artifact under heavy slow-mo entirely, and is crisper. */
  still?: string;
  /** frames into the usable clip to begin (relative to usable start). */
  trimStart?: number;
  /** how many frames of the clip this scene will show. */
  showFrames: number;
  /** playbackRate for the footage (slow-mo < 1). */
  playbackRate?: number;
};

const FILL: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" };

/**
 * Renders a still frame (focus scenes), real capture video, or the app-shell stand-in.
 */
export const Footage: React.FC<Props> = ({
  id,
  label,
  page,
  variant,
  still,
  trimStart = 0,
  showFrames,
  playbackRate = 1,
}) => {
  // A pre-extracted still, shown exactly like the video (object-fit cover, top-aligned) so focus
  // coordinates measured against the footage stay valid.
  if (still) {
    return <Img src={staticFile(`stills/${still}`)} style={FILL} />;
  }

  const clip = getClip(id);

  if (!FOOTAGE_AVAILABLE || !clip) {
    return <StandIn label={label} page={page} variant={variant} />;
  }

  const src = staticFile(`footage/${clip.file}`);
  const startFrom = clipStartFrom() + trimStart;
  const shown = Math.ceil(showFrames * playbackRate);
  // Extend endAt past the last shown frame (avoids the boundary blank), but never past the clip's real
  // last decodable frame.
  const clipLastFrame = clip.durationSec != null ? Math.floor(clip.durationSec * fps) - 2 : null;
  let endAt = startFrom + shown + DECODE_TAIL_BUFFER;
  if (clipLastFrame != null) endAt = Math.min(endAt, clipLastFrame);
  endAt = Math.max(endAt, startFrom + shown + 1); // never clip a frame we actually show

  return (
    <OffthreadVideo
      src={src}
      startFrom={startFrom}
      endAt={endAt}
      playbackRate={playbackRate}
      style={FILL}
      transparent={false}
    />
  );
};
