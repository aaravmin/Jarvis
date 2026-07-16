import clicksJson from "./clicks.json";

/** One recorded click from the capture (page-space 1920x1080 coords, time from recording start). */
export type RawClick = { tSec: number; x: number; y: number; label: string };

type ClicksFile = Record<string, RawClick[]>;

const data = clicksJson as ClicksFile;

export const getClicks = (id: string): RawClick[] => data[id] ?? [];
