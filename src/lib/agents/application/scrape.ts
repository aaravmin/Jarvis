import "server-only";
import { launchBrowser, newPage, type PwPage } from "./browser";
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

/** A reproducible CSS selector for a control, preferring id then name (both survive a fresh page load). */
function selectorFor(id: string | undefined, name: string | undefined): string | undefined {
  if (id) return `#${cssEscape(id)}`;
  if (name) return `[name="${cssAttrEscape(name)}"]`;
  return undefined;
}

/** Escape an id for a `#id` selector (CSS.escape isn't available server-side). */
function cssEscape(s: string): string {
  return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
/** Escape a value for use inside a double-quoted attribute selector. */
function cssAttrEscape(s: string): string {
  return s.replace(/(["\\])/g, "\\$1");
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
    const id = attr(tag, "id");
    const name = attr(tag, "name") ?? id;
    if (!name) continue;
    push({
      name,
      label: resolveLabel(tag, labels),
      type: toFieldType(rawType, "input"),
      required: hasFlag(tag, "required") || attr(tag, "aria-required") === "true",
      selector: selectorFor(id, attr(tag, "name")),
    });
  }

  // <textarea>
  const taRe = /<textarea\b([^>]*)>/gi;
  while ((m = taRe.exec(html))) {
    const tag = m[1];
    const id = attr(tag, "id");
    const name = attr(tag, "name") ?? id;
    if (!name) continue;
    push({
      name,
      label: resolveLabel(tag, labels),
      type: "textarea",
      required: hasFlag(tag, "required") || attr(tag, "aria-required") === "true",
      selector: selectorFor(id, attr(tag, "name")),
    });
  }

  // <select>…</select>
  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(html))) {
    const tag = m[1];
    const id = attr(tag, "id");
    const name = attr(tag, "name") ?? id;
    if (!name) continue;
    push({
      name,
      label: resolveLabel(tag, labels),
      type: "select",
      required: hasFlag(tag, "required") || attr(tag, "aria-required") === "true",
      options: parseOptions(m[2]),
      selector: selectorFor(id, attr(tag, "name")),
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

/** One control as the in-browser reader returns it (before mapping to our FormFieldType). */
type RawDomField = {
  name: string;
  label: string;
  rawType: string;
  tag: "input" | "textarea" | "select";
  required: boolean;
  options?: string[];
  selector?: string;
};

/**
 * Browser-side form reader, passed to page.evaluate as a STRING so TypeScript never tries to type the
 * DOM globals it uses. Reads the RENDERED DOM (so JS-built forms are visible), resolves each control's
 * visible label the way a human sees it, groups radio buttons by name, and skips invisible/no-data
 * controls. Returns RawDomField[].
 */
const DOM_READER = `(() => {
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&'));
  const visible = (el) => {
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0 || el.type === 'radio' || el.type === 'checkbox';
  };
  const text = (n) => (n && n.textContent ? n.textContent.replace(/\\s+/g, ' ').trim() : '');
  const labelFor = (el) => {
    if (el.id) { const l = document.querySelector('label[for="' + esc(el.id) + '"]'); if (text(l)) return text(l); }
    const wrap = el.closest('label'); if (text(wrap)) return text(wrap);
    const aria = el.getAttribute('aria-label'); if (aria) return aria.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const parts = lb.split(/\\s+/).map((id) => text(document.getElementById(id))).filter(Boolean); if (parts.length) return parts.join(' '); }
    const ph = el.getAttribute('placeholder'); if (ph) return ph.trim();
    return '';
  };
  const groupLabel = (el) => {
    const fs = el.closest('fieldset'); const lg = fs && fs.querySelector('legend');
    return text(lg) || '';
  };
  const selFor = (el) => {
    if (el.id) return '#' + esc(el.id);
    const nm = el.getAttribute('name');
    if (nm) return el.tagName.toLowerCase() + '[name="' + nm.replace(/(["\\\\])/g, '\\\\$1') + '"]';
    return '';
  };
  const out = []; const seen = new Set(); const radios = new Map();
  const els = Array.prototype.slice.call(document.querySelectorAll('input, textarea, select'));
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    let rawType = 'text';
    if (tag === 'select') rawType = 'select';
    else if (tag === 'textarea') rawType = 'textarea';
    else {
      rawType = (el.getAttribute('type') || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].indexOf(rawType) !== -1) continue;
    }
    if (!visible(el)) continue;
    const name = el.getAttribute('name') || el.id || '';
    const required = !!el.required || el.getAttribute('aria-required') === 'true';
    if (rawType === 'radio') {
      const key = name || el.id || Math.random().toString();
      let g = radios.get(key);
      if (!g) { g = { name: name || key, label: groupLabel(el) || labelFor(el) || name || 'Choice', rawType: 'radio', tag: 'input', required, options: [], selector: name ? 'input[name="' + name.replace(/(["\\\\])/g, '\\\\$1') + '"]' : selFor(el) }; radios.set(key, g); out.push(g); }
      const opt = labelFor(el) || el.value; if (opt && g.options.indexOf(opt) === -1) g.options.push(opt);
      if (required) g.required = true;
      continue;
    }
    const label = labelFor(el) || (name ? name : 'Field');
    let options;
    if (tag === 'select') options = Array.prototype.slice.call(el.options).map((o) => text(o)).filter((t) => t && !/^(select|choose|--)/i.test(t));
    if (rawType === 'checkbox') { const v = labelFor(el) || el.value; options = v ? [v] : undefined; }
    const key = rawType + ':' + name.toLowerCase() + ':' + label.toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    out.push({ name: name || label, label, rawType, tag, required, options, selector: selFor(el) });
  }
  return out;
})()`;

/** Map a RawDomField to our FormField (coarse type + carry the selector through). */
function toFormField(r: RawDomField): FormField {
  return {
    name: r.name,
    label: r.label,
    type: toFieldType(r.rawType, r.tag),
    required: r.required,
    options: r.options && r.options.length ? r.options : undefined,
    selector: r.selector || undefined,
  };
}

/**
 * Optional Playwright backend. Renders the page and reads the LIVE DOM (so JS-built forms are visible),
 * capturing each control's label, type, options and a re-locatable selector. Returns null when
 * Playwright is unavailable — the caller then uses the static path.
 */
async function browserScrape(url: string): Promise<ScrapedForm | null> {
  const browser = await launchBrowser({ headless: true });
  if (!browser) return null;
  let page: PwPage | null = null;
  try {
    page = await newPage(browser);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: FETCH_TIMEOUT_MS });
    // Give client-rendered forms a moment to mount, then read the DOM directly.
    try {
      await page.waitForLoadState("networkidle", { timeout: 5_000 });
    } catch {
      /* networkidle can never settle on chatty pages — proceed with what's rendered */
    }
    const raw = (await page.evaluate<RawDomField[]>(DOM_READER as unknown as () => RawDomField[])) ?? [];
    const fields = raw.map(toFormField);
    const html = await page.content();
    return {
      fields,
      title: (await page.title())?.trim() || parseTitle(html),
      organization: parseOrganization(html),
      via: "browser",
      empty: fields.length === 0,
    };
  } catch {
    return null; // any failure → fall back to static
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
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
