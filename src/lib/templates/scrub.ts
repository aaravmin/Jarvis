/**
 * Defense-in-depth scrubber. The PRIMARY guarantee that the personal connection detail is never
 * persisted is structural: the save endpoint only ever receives the generalized template, never the
 * detail. This scrubber is the backstop — if the model accidentally echoes a name/company/email from
 * the personal detail into the generalized output, we replace it with the {{connection}} placeholder
 * before it can be shown as "safe to save".
 */

export const CONNECTION_PLACEHOLDER = "{{connection}}";

// Capitalized words that are almost always generic (sentence starters / pronouns), not identifying.
const STOPWORDS = new Set([
  "I", "My", "Me", "We", "Our", "Us", "The", "A", "An", "He", "She", "They", "His", "Her", "Their",
  "You", "Your", "This", "That", "It", "And", "But", "So", "To", "Of", "In", "On", "At", "For",
  "With", "From", "Dear", "Hi", "Hello", "Best", "Thanks", "Thank", "Regards", "Sincerely",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace any occurrence of the personal `detail` (verbatim, or its identifying tokens — proper nouns,
 * emails, long number runs) inside `text` with the connection placeholder. Returns the scrubbed text
 * and whether anything was stripped.
 */
export function scrubPersonalDetail(text: string, detail: string): { text: string; leaked: boolean } {
  if (!text || !detail || !detail.trim()) return { text, leaked: false };

  const tokens = new Set<string>();
  const whole = detail.trim();
  if (whole.length >= 4) tokens.add(whole);
  for (const m of detail.matchAll(/\b[A-Z][a-zA-Z.'&-]{2,}\b/g)) {
    if (!STOPWORDS.has(m[0])) tokens.add(m[0]);
  }
  for (const m of detail.matchAll(/\b[\w.+-]+@[\w.-]+\.\w+\b/g)) tokens.add(m[0]);
  for (const m of detail.matchAll(/\b\d{4,}\b/g)) tokens.add(m[0]);

  // Longest tokens first so "Acme Corp" is replaced before its parts.
  const ordered = [...tokens].sort((a, b) => b.length - a.length);
  let out = text;
  let leaked = false;
  for (const tok of ordered) {
    const re = new RegExp(escapeRegExp(tok), "gi");
    const before = out;
    out = out.replace(re, CONNECTION_PLACEHOLDER);
    if (out !== before) leaked = true;
  }
  // Collapse runs of placeholders the replacement may have produced.
  out = out.replace(/(?:\{\{connection\}\}\s*){2,}/g, `${CONNECTION_PLACEHOLDER} `).trim();
  return { text: out, leaked };
}

/** Pull the distinct {{placeholder}} keys out of a template's text. */
export function extractPlaceholders(...texts: string[]): string[] {
  const keys = new Set<string>();
  for (const t of texts) {
    for (const m of (t ?? "").matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) keys.add(m[1]);
  }
  return [...keys];
}
