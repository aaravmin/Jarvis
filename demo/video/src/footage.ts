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
