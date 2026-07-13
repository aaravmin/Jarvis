import "server-only";
import * as chrono from "chrono-node";

/**
 * Deterministic date resolution (HARD RULE #2): the LLM never computes dates. It returns verbatim
 * phrases ("by Friday", "next week"); this module resolves them with chrono against the source's
 * occurred_at (refISO) so a "by Friday" in last week's email resolves to the right Friday.
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
 * An event date phrase → {startsAt, endsAt}. Handles ranges ("Feb 7-9, 2026" → start+end) and single
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
