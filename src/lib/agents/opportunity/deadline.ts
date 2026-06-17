import "server-only";
import * as chrono from "chrono-node";

/**
 * Deterministic date resolution — the hard-rule-#2 boundary.
 *
 * The LLM is forbidden from computing or emitting any resolved date; it returns only the VERBATIM
 * string it found ("Applications due March 15, 2026", "Feb 7–9", "rolling"). These functions turn
 * those strings into timestamps using chrono-node, anchored to the run's reference time, resolving
 * ambiguous dates FORWARD (a deadline with no year is the next occurrence, not a past one).
 *
 * If chrono can't parse it (e.g. "rolling", "ongoing"), we return undefined and the UI falls back to
 * showing the raw string — which is always the source of truth. We never invent a date.
 *
 * Timezone note: when the source text names a zone ("11:59pm ET") chrono honors it; otherwise the
 * value is interpreted in the server's local zone. The raw string is displayed as the authority, so
 * this only affects sorting/reminder convenience, never what the user sees as the actual deadline.
 */

const MAX_INPUT = 200; // guard against pathological inputs; real date phrases are short

function referenceDate(refISO?: string): Date {
  if (refISO) {
    const d = new Date(refISO);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** A single deadline → ISO timestamp, or undefined if unparseable. Ambiguous dates resolve forward. */
export function resolveDeadline(raw: string | undefined | null, refISO?: string): string | undefined {
  const text = (raw ?? "").trim();
  if (!text || text.length > MAX_INPUT) return undefined;
  try {
    const date = chrono.parseDate(text, referenceDate(refISO), { forwardDate: true });
    return date ? date.toISOString() : undefined;
  } catch {
    return undefined; // never let date parsing abort a run
  }
}

/**
 * An event date phrase → {startsAt, endsAt}. Handles ranges ("Feb 7–9, 2026" → start+end) and single
 * dates ("Demo day April 3" → start only). Either field is undefined when not resolvable.
 */
export function resolveDateRange(
  raw: string | undefined | null,
  refISO?: string,
): { startsAt?: string; endsAt?: string } {
  const text = (raw ?? "").trim();
  if (!text || text.length > MAX_INPUT) return {};
  try {
    const results = chrono.parse(text, referenceDate(refISO), { forwardDate: true });
    const first = results[0];
    if (!first) return {};
    const startsAt = first.start?.date()?.toISOString();
    const endsAt = first.end?.date()?.toISOString();
    return { startsAt, endsAt };
  } catch {
    return {};
  }
}
