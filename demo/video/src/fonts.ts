/**
 * Warm, characterful type pairing for the film's OVERLAYS ONLY (title cards, the Otto close,
 * captions / lower-thirds, small labels). The app footage inside the browser frame is untouched.
 *
 * Loaded via @remotion/google-fonts so the faces are actually embedded in the render:
 * loadFont() registers a delayRender()/continueRender() internally, so `remotion render` BLOCKS
 * until every requested weight is loaded before it screenshots a frame - no silent system fallback.
 * `fontsReady()` is exposed as a belt-and-suspenders await if a caller wants to gate explicitly.
 *
 *  - Fraunces: a soft, warm display serif (weight + optical sizing) -> the big title cards.
 *  - Figtree:  a friendly humanist sans -> captions, eyebrows, small labels, sub-lines.
 */
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";

const fraunces = loadFraunces("normal", {
  weights: ["400", "500", "600", "700", "900"],
  subsets: ["latin"],
});

const figtree = loadFigtree("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

// The loaded family name comes first; the trailing fallbacks only ever apply if loading fails
// (it will not - the render blocks on the delayRender above and errors loudly if a face 404s).
export const SERIF = `${fraunces.fontFamily}, Georgia, "Times New Roman", serif`;
export const SANS = `${figtree.fontFamily}, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

/** The bare loaded family names, for callers that want them without the fallback stack. */
export const SERIF_FAMILY = fraunces.fontFamily; // "Fraunces"
export const SANS_FAMILY = figtree.fontFamily; // "Figtree"

/** Optional explicit gate: resolves once every requested weight of both faces is loaded. */
export const fontsReady = (): Promise<unknown> =>
  Promise.all([fraunces.waitUntilDone(), figtree.waitUntilDone()]);
