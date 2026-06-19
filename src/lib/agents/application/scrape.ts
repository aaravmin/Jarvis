import "server-only";
import type { FormField, FormFieldType } from "./types";

/**
 * Reads an application form (the agent's "eyes"). Two backends:
 *
 *   • static  (always available, no deps) — fetch the HTML and parse <form> controls. Works for
 *     server-rendered forms (Greenhouse, Lever, many ATS, most grant portals).
 *   • browser (optional, env-gated JARVIS_BROWSER=playwright) — render with Playwright and read the
 *     live DOM, so JS-built forms (Workday, embedded widgets) are visible too. Falls back to static if
 *     Playwright isn't installed. This is the "hands/eyes" the roadmap calls for; enable it once the
 *     `playwright` package + a browser are provisioned (npm i playwright && npx playwright install chromium).
 *
 * Either way the agent only READS the form here — it never fills or submits (hard rule #5).
 */

export type ScrapedForm = {
  fields: FormField[];
  title?: string;
  organization?: string;
  /** Which backend actually produced the fields, for honest reporting in the run summary. */
  via: "browser" | "static";
  /** True when we fetched the page but found no recognizable form fields (likely a JS-only form). */
  empty: boolean;
};

const FETCH_TIMEOUT_MS = 15_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Map an <input type> (or tag) to our coarse field type. */
function toFieldType(raw: string | undefined, tag: "input" | "textarea" | "select"): FormFieldType {
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  switch ((raw ?? "text").toLowerCase()) {
    case "email":
      return "email";
    case "tel":
      return "tel";
    case "url":
      return "url";
    case "number":
      return "number";
    case "date":
    case "datetime-local":
    case "month":
      return "date";
    case "radio":
      return "radio";
    case "checkbox":
      return "checkbox";
    case "file":
      return "file";
    case "text":
    case "search":
    case "password": // captured as text; the resolver will never fill a password
      return "text";
    default:
      return "other";
  }
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : undefined;
}

function hasFlag(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}(\\s|=|>|/|$)`, "i").test(tag);
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Turn a snake/camel/kebab field name into a readable label as a last resort. */
function humanize(name: string): string {
  const s = name
    .replace(/[_\-.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : name;
}

/** Collect <label for="id">text</label> → { id: text } so fields can find their visible label. */
function labelMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const forId = attr(m[1], "for");
    const text = stripTags(m[2]);
    if (forId && text) map.set(forId, text);
  }
  return map;
}

function resolveLabel(tag: string, labels: Map<string, string>): string {
  const id = attr(tag, "id");
  const name = attr(tag, "name") ?? id ?? "";
  return (
    (id && labels.get(id)) ||
    attr(tag, "aria-label") ||
    attr(tag, "placeholder") ||
    (name ? humanize(name) : "Field")
  );
}

/** Parse <select>…</select> options into their visible text. */
function parseOptions(block: string): string[] {
  const out: string[] = [];
  const re = /<option\b[^>]*>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const text = stripTags(m[1]);
    if (text && !/^(select|choose|--)/i.test(text)) out.push(text);
  }
  return out;
}

/** Parse all form controls out of raw HTML. Backend for the static path; deps-free. */
function parseFields(html: string): FormField[] {
  const labels = labelMap(html);
  const fields: FormField[] = [];
  const seen = new Set<string>();

  const push = (f: FormField) => {
    const key = `${f.type}:${f.name.toLowerCase()}:${f.label.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push(f);
  };

  // <input> — skip controls that carry no applicant data.
  const inputRe = /<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html))) {
    const tag = m[1];
    const rawType = (attr(tag, "type") ?? "text").toLowerCase();
    if (["hidden", "submit", "button", "reset", "image"].includes(rawType)) continue;
    const name = attr(tag, "name") ?? attr(tag, "id");
    if (!name) continue;
    push({
      name,
      label: resolveLabel(tag, labels),
      type: toFieldType(rawType, "input"),
      required: hasFlag(tag, "required") || attr(tag, "aria-required") === "true",
    });
  }

  // <textarea>
  const taRe = /<textarea\b([^>]*)>/gi;
  while ((m = taRe.exec(html))) {
    const tag = m[1];
    const name = attr(tag, "name") ?? attr(tag, "id");
    if (!name) continue;
    push({
      name,
      label: resolveLabel(tag, labels),
      type: "textarea",
      required: hasFlag(tag, "required") || attr(tag, "aria-required") === "true",
    });
  }

  // <select>…</select>
  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(html))) {
    const tag = m[1];
    const name = attr(tag, "name") ?? attr(tag, "id");
    if (!name) continue;
    push({
      name,
      label: resolveLabel(tag, labels),
      type: "select",
      required: hasFlag(tag, "required") || attr(tag, "aria-required") === "true",
      options: parseOptions(m[2]),
    });
  }

  return fields;
}

function parseTitle(html: string): string | undefined {
  const og =
    attr((html.match(/<meta\b[^>]*property=["']og:title["'][^>]*>/i) ?? [""])[0], "content") ||
    stripTags((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) ?? [, ""])[1] ?? "");
  return og?.trim() || undefined;
}

function parseOrganization(html: string): string | undefined {
  const site = attr((html.match(/<meta\b[^>]*property=["']og:site_name["'][^>]*>/i) ?? [""])[0], "content");
  return site?.trim() || undefined;
}

/** Optional Playwright backend. `new Function` hides the specifier so the bundler never resolves it;
 *  returns null when the package isn't installed — the caller then uses the static path. */
async function browserScrape(url: string): Promise<ScrapedForm | null> {
  if (process.env.JARVIS_BROWSER !== "playwright") return null;
  try {
    const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<{
      chromium?: { launch: (o?: unknown) => Promise<unknown> };
    }>;
    const pw = await dynamicImport("playwright");
    if (!pw.chromium) return null;
    const browser = (await pw.chromium.launch({ headless: true })) as {
      newPage: () => Promise<unknown>;
      close: () => Promise<void>;
    };
    try {
      const page = (await browser.newPage()) as {
        goto: (u: string, o?: unknown) => Promise<unknown>;
        content: () => Promise<string>;
        title: () => Promise<string>;
      };
      await page.goto(url, { waitUntil: "networkidle", timeout: FETCH_TIMEOUT_MS });
      const html = await page.content();
      const fields = parseFields(html);
      return {
        fields,
        title: (await page.title())?.trim() || parseTitle(html),
        organization: parseOrganization(html),
        via: "browser",
        empty: fields.length === 0,
      };
    } finally {
      await browser.close();
    }
  } catch {
    return null; // any failure → fall back to static
  }
}

/** Fetch + statically parse the form. Throws only on a hard network/HTTP failure. */
async function staticScrape(url: string): Promise<ScrapedForm> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`The application page returned ${res.status}.`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const fields = parseFields(html);
  return {
    fields,
    title: parseTitle(html),
    organization: parseOrganization(html),
    via: "static",
    empty: fields.length === 0,
  };
}

/**
 * Read the application form at `url`. Tries the browser backend when enabled (better for JS forms),
 * otherwise (and on any browser failure) the static fetch+parse backend.
 */
export async function scrapeForm(url: string): Promise<ScrapedForm> {
  const viaBrowser = await browserScrape(url);
  if (viaBrowser && !viaBrowser.empty) return viaBrowser;
  return staticScrape(url);
}
