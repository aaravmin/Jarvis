import "server-only";

/**
 * Remove em-dashes and en-dashes from any text the app shows or speaks to the user. The user does not
 * want them anywhere (especially in web-search answers). We keep meaning intact:
 *   - a numeric range like "3–5" becomes "3-5" (a plain hyphen),
 *   - a clause break like "fast — really fast" becomes "fast, really fast" (a comma),
 *   - any leftover dash becomes a plain hyphen.
 */
export function stripDashes(input: string): string {
  if (!input) return input;
  return input
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2") // numeric range -> hyphen
    .replace(/\s+[—–]\s+/g, ", ") // " — " clause break -> comma
    .replace(/[—–]/g, "-") // anything else -> hyphen
    .replace(/ ,/g, ",") // tidy a stray space before a comma
    .replace(/,\s*,/g, ", "); // collapse a doubled comma
}
