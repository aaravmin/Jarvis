import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  browserEnabled,
  launchBrowser,
  newPage,
  registerSession,
  type PwLocator,
  type PwPage,
} from "./browser";
import { getDocument } from "@/lib/documents/store";
import type { FieldPlanItem } from "./types";

/**
 * The Application agent's "hands": drive a REAL browser to type the grounded field_plan into the live
 * form, attach the resume, then LEAVE THE WINDOW OPEN for the user to review and submit. It never clicks
 * Submit/Apply, submission is the user's explicit action (hard rule #5, submit-only-on-click).
 *
 * Only grounded values (filled=true) are entered; everything left for the user stays blank so the user
 * sees exactly what still needs them. Each field fills independently, one stubborn control never aborts
 * the rest, and every skip is reported back with a reason.
 *
 * Requires JARVIS_BROWSER=playwright + an installed browser. Otherwise returns { unavailable:true } and
 * the UI falls back to "Open application" + copy-from-the-plan.
 */

const NAV_TIMEOUT_MS = 30_000;
const FIELD_TIMEOUT_MS = 5_000;

export type AutofillSkip = { label: string; reason: string };

export type AutofillResult = {
  ok: boolean;
  /** Playwright isn't enabled/installed, caller should fall back to manual. */
  unavailable?: boolean;
  filledCount: number;
  totalFillable: number;
  skipped: AutofillSkip[];
  attachedResume: boolean;
  message: string;
  error?: string;
};

type RunRow = {
  target_url: string;
  field_plan: FieldPlanItem[] | null;
  resume_id: string | null;
  status: string;
};

// ── selector escaping (CSS.escape isn't available server-side) ───────────────────────────────────
function cssId(s: string): string {
  return s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
function cssAttr(s: string): string {
  return s.replace(/(["\\])/g, "\\$1");
}

/** Re-locate a control on the live page from the identity captured at scrape time. */
async function locate(page: PwPage, item: FieldPlanItem): Promise<PwLocator | null> {
  const candidates: string[] = [];
  if (item.selector) candidates.push(item.selector);
  if (item.name) {
    candidates.push(`[name="${cssAttr(item.name)}"]`);
    candidates.push(`#${cssId(item.name)}`);
  }
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) return loc;
    } catch {
      /* invalid selector, try the next */
    }
  }
  // Last resort: match by the visible label the way a human would.
  try {
    const byLabel = page.getByLabel(item.label, { exact: false }).first();
    if ((await byLabel.count()) > 0) return byLabel;
  } catch {
    /* getByLabel can throw on odd labels */
  }
  return null;
}

const AFFIRMATIVE = /^(y|yes|true|on|1|checked|agree|i agree|accept)/i;

/** Enter one grounded field. Returns null on success or a reason string on skip. */
async function fillOne(page: PwPage, item: FieldPlanItem): Promise<string | null> {
  const type = item.field_type ?? "text";
  const value = item.value.trim();
  if (!value) return "no value";

  if (type === "select") {
    const loc = await locate(page, item);
    if (!loc) return "control not found";
    try {
      await loc.selectOption({ label: value }, { timeout: FIELD_TIMEOUT_MS });
      return null;
    } catch {
      try {
        await loc.selectOption(value, { timeout: FIELD_TIMEOUT_MS });
        return null;
      } catch {
        return `no option matched "${value}"`;
      }
    }
  }

  if (type === "radio") {
    // The value IS the chosen option's label, so match the radio by its label first.
    try {
      await page.getByLabel(value, { exact: false }).first().check({ timeout: FIELD_TIMEOUT_MS });
      return null;
    } catch {
      if (item.name) {
        try {
          await page
            .locator(`input[type="radio"][name="${cssAttr(item.name)}"][value="${cssAttr(value)}"]`)
            .first()
            .check({ timeout: FIELD_TIMEOUT_MS });
          return null;
        } catch {
          /* fall through */
        }
      }
      return `no radio matched "${value}"`;
    }
  }

  if (type === "checkbox") {
    if (!AFFIRMATIVE.test(value)) return "value isn't an affirmative";
    const loc = await locate(page, item);
    if (!loc) return "control not found";
    try {
      await loc.check({ timeout: FIELD_TIMEOUT_MS });
      return null;
    } catch {
      return "couldn't check";
    }
  }

  // text, email, tel, url, number, date, textarea, other → type it in.
  const loc = await locate(page, item);
  if (!loc) return "control not found";
  try {
    await loc.fill(value, { timeout: FIELD_TIMEOUT_MS });
    return null;
  } catch {
    return "couldn't type into control";
  }
}

/** Download the resume bytes from private Storage so Playwright can attach the file. */
async function loadResumeFile(
  supabase: SupabaseClient,
  userId: string,
  resumeId: string | null,
): Promise<{ name: string; mimeType: string; buffer: Buffer } | null> {
  if (!resumeId) return null;
  const doc = await getDocument(supabase, userId, resumeId);
  if (!doc?.storagePath) return null;
  const { data, error } = await supabase.storage.from("documents").download(doc.storagePath);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    name: doc.name?.trim() || "resume.pdf",
    mimeType: doc.mimeType || "application/octet-stream",
    buffer,
  };
}

export async function autofillApplication(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  nowMs: number,
): Promise<AutofillResult> {
  if (!browserEnabled()) {
    return {
      ok: false,
      unavailable: true,
      filledCount: 0,
      totalFillable: 0,
      skipped: [],
      attachedResume: false,
      message:
        "Browser autofill is off. Set JARVIS_BROWSER=playwright (and install Playwright) to let Jarvis type into the live form. Until then, use Open application and copy from the plan.",
    };
  }

  const { data: run } = await supabase
    .from("application_runs")
    .select("target_url, field_plan, resume_id, status")
    .eq("user_id", userId)
    .eq("id", runId)
    .maybeSingle<RunRow>();
  if (!run) {
    return { ok: false, filledCount: 0, totalFillable: 0, skipped: [], attachedResume: false, message: "Application not found.", error: "not_found" };
  }

  const plan = (run.field_plan ?? []).filter((f) => (f.field_type ?? "text") !== "file");
  const fillable = plan.filter((f) => f.filled && f.value.trim().length > 0);

  const browser = await launchBrowser({ headless: false });
  if (!browser) {
    return {
      ok: false,
      unavailable: true,
      filledCount: 0,
      totalFillable: fillable.length,
      skipped: [],
      attachedResume: false,
      message:
        "Couldn't launch a browser. Install it with `npx playwright install chromium`, then try again. Meanwhile, Open application and copy from the plan.",
    };
  }

  const skipped: AutofillSkip[] = [];
  let filledCount = 0;
  let attachedResume = false;

  try {
    const page = await newPage(browser);
    await page.goto(run.target_url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    try {
      await page.waitForLoadState("networkidle", { timeout: 5_000 });
    } catch {
      /* chatty pages never go idle, proceed with what's rendered */
    }

    for (const item of fillable) {
      const reason = await fillOne(page, item);
      if (reason) skipped.push({ label: item.label, reason });
      else filledCount += 1;
    }

    // Attach the resume to the first file input on the page (works even when it's visually hidden).
    const resumeFile = await loadResumeFile(supabase, userId, run.resume_id);
    if (resumeFile) {
      try {
        const fileLoc = page.locator('input[type="file"]').first();
        if ((await fileLoc.count()) > 0) {
          await fileLoc.setInputFiles(
            { name: resumeFile.name, mimeType: resumeFile.mimeType, buffer: resumeFile.buffer },
            { timeout: FIELD_TIMEOUT_MS },
          );
          attachedResume = true;
        }
      } catch {
        /* no usable file input, or the page rejected it, the user can attach manually */
      }
    }

    try {
      await page.bringToFront();
    } catch {
      /* non-fatal */
    }

    // Keep the window OPEN for the user to review + submit. Track it so a re-fill replaces it.
    await registerSession(runId, { browser, page, createdAt: nowMs });

    const parts = [
      `Filled ${filledCount} of ${fillable.length} grounded field${fillable.length === 1 ? "" : "s"} in the open browser window.`,
      attachedResume ? "Attached your resume." : null,
      skipped.length ? `${skipped.length} couldn't be matched, finish those by hand.` : null,
      "Review everything, then submit it yourself, Jarvis never submits for you.",
    ].filter(Boolean);

    return {
      ok: true,
      filledCount,
      totalFillable: fillable.length,
      skipped,
      attachedResume,
      message: parts.join(" "),
    };
  } catch (err) {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
    const error = err instanceof Error ? err.message : "Autofill failed.";
    return {
      ok: false,
      filledCount,
      totalFillable: fillable.length,
      skipped,
      attachedResume,
      message: `Couldn't drive the form: ${error}. Open the application and copy from the plan instead.`,
      error,
    };
  }
}
