import manifest from "./footage-manifest.json";
import { fps } from "./theme";

export type Clip = {
  id: string;
  file: string;
  // The capture manifest may record wall-clock timing and leave this null; the
  // render never depends on it (playback is sized by showFrames * playbackRate).
  durationSec: number | null;
  notes?: string;
};

type Manifest = {
  available: boolean;
  clips: Clip[];
};

const m = manifest as Manifest;

export const FOOTAGE_AVAILABLE: boolean = m.available === true && m.clips.length > 0;

const byId = new Map<string, Clip>(m.clips.map((c) => [c.id, c]));

export const getClip = (id: string): Clip | null => byId.get(id) ?? null;

/** Usable frames of a clip, minus the 2s of padding the capture agent records on each end. */
export const clipUsableFrames = (id: string, paddingSec = 2): number | null => {
  const c = getClip(id);
  if (!c || c.durationSec == null) return null;
  return Math.max(1, Math.round((c.durationSec - paddingSec * 2) * fps));
};

/** Frame offset into the raw webm where the usable middle begins. */
export const clipStartFrom = (paddingSec = 2): number => Math.round(paddingSec * fps);

/**
 * trimStart that anchors a scene to a clip's TAIL: show `tailFrames` of footage ending `endPadSec`
 * before the clip's true end. Used for held final beats (e.g. the Suggested section at the end of the
 * Today clip) so the scene lands on the sustained hold regardless of the exact scroll timing. Returns a
 * trimStart relative to the usable start (Footage adds clipStartFrom() back). Falls back to 0 if the
 * clip duration is unknown.
 */
export const clipTailTrim = (id: string, tailFrames: number, endPadSec = 0.4): number => {
  const c = getClip(id);
  if (!c || c.durationSec == null) return 0;
  const totalFrames = Math.round(c.durationSec * fps);
  const endFrame = totalFrames - Math.round(endPadSec * fps);
  const startFromRaw = Math.max(clipStartFrom(), endFrame - tailFrames);
  return Math.max(0, startFromRaw - clipStartFrom());
};
