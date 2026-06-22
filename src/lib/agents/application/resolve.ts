import "server-only";
import { grokStructured } from "@/lib/llm/grok";
import { backs, clamp01 } from "@/lib/agents/citation-gate";
import type { FormField, FieldPlanItem, FieldValueSource } from "./types";

/**
 * The "brain": map scraped form fields onto the user's materials with Grok, producing a grounded
 * field_plan. Provenance is enforced in CODE, not just prompt (hard rule #3): a value is only kept as
 * `filled` when its source_quote genuinely appears in the materials. Anything the model proposes
 * without a real backing quote is demoted to a low-trust "inferred" suggestion the user must confirm.
 *
 * Hard rule #2: the model never computes a date. A date field is filled only if the date is present
 * verbatim in the materials; otherwise it's left for the user.
 */

export type MaterialsBundle = {
  resumeName?: string;
  resumeText?: string;
  documents: { name: string; text: string }[];
  profileDigest?: string;
  /** Title/org/description of the opportunity this application is for, if launched from a card. */
  opportunityContext?: string;
};

const VALUE_SOURCES: FieldValueSource[] = ["resume", "profile", "document", "opportunity", "inferred", "user"];

/** Carry the form control's identity into the plan item so the Playwright autofill can re-locate it. */
function identity(f: FormField): Pick<FieldPlanItem, "name" | "field_type" | "selector" | "options"> {
  return {
    name: f.name,
    field_type: f.type,
    selector: f.selector,
    options: f.options && f.options.length ? f.options : undefined,
  };
}

const FIELD_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", description: "Echo the form field's label exactly." },
          value: { type: "string", description: "The value to enter, or empty string if you can't ground it." },
          source: { type: "string", enum: VALUE_SOURCES },
          source_quote: {
            type: "string",
            description: "Verbatim snippet from the MATERIALS that supports value. Empty only when value is empty.",
          },
          confidence: { type: "number" },
          required: { type: "boolean" },
          filled: { type: "boolean", description: "true only when value is grounded in source_quote." },
        },
        required: ["label", "value", "source", "source_quote", "confidence", "required", "filled"],
      },
    },
    notes: { type: "string", description: "One or two sentences on what couldn't be filled and why." },
  },
  required: ["fields", "notes"],
};

const SYSTEM = `You prepare a job/grant application by mapping the form's fields onto the applicant's MATERIALS.

HARD RULES:
- Fill a field ONLY from the MATERIALS. Copy a verbatim snippet into source_quote that supports the value. If nothing in the MATERIALS supports it, set value="" , filled=false, source="user".
- NEVER invent or compute facts, no made-up dates, employers, GPAs, addresses, or phone numbers. Do NOT compute a date from "today"; only use a date if it appears verbatim in the MATERIALS.
- Never fill a password or a file-upload field (the user attaches files themselves): value="", filled=false, source="user".
- For a long free-text field (cover letter, "why you", essay), you MAY compose prose, but every factual claim in it must be supported by a MATERIALS snippet you put in source_quote; keep confidence modest.
- Choose source from: resume, profile, document, opportunity, inferred, user. Use "inferred" only for a reasonable guess you cannot quote, and then filled must be false.
- confidence is 0..1: how sure you are the value is correct AND grounded.
- Return exactly one entry per form field, echoing its label.`;

/** Build the single MATERIALS text block the model reads (and that we later verify quotes against). */
function materialsText(m: MaterialsBundle): string {
  const parts: string[] = [];
  if (m.profileDigest) parts.push(m.profileDigest);
  if (m.opportunityContext) parts.push(`Opportunity:\n${m.opportunityContext}`);
  if (m.resumeText) parts.push(`Resume${m.resumeName ? ` (${m.resumeName})` : ""}:\n${m.resumeText}`);
  for (const d of m.documents) {
    if (d.text?.trim()) parts.push(`Document (${d.name}):\n${d.text}`);
  }
  return parts.join("\n\n");
}

function describeFields(fields: FormField[]): string {
  return fields
    .map((f, i) => {
      const bits = [`${i + 1}. "${f.label}" [${f.type}${f.required ? ", required" : ""}]`];
      if (f.options?.length) bits.push(`   options: ${f.options.slice(0, 25).join(" | ")}`);
      return bits.join("\n");
    })
    .join("\n");
}

const GROUNDABLE_LIMIT = 60_000; // keep the prompt bounded; resumes/docs are far smaller

/**
 * Resolve the form fields against the materials. Returns the validated field_plan plus the model's
 * notes. Every `filled` item is guaranteed to have a real backing quote (verified here, not trusted).
 */
export async function resolveFields(
  fields: FormField[],
  materials: MaterialsBundle,
): Promise<{ plan: FieldPlanItem[]; notes: string }> {
  if (fields.length === 0) return { plan: [], notes: "No form fields were found to fill." };

  const corpus = materialsText(materials).slice(0, GROUNDABLE_LIMIT);
  if (!corpus.trim()) {
    // No materials at all, nothing can be grounded. Return an all-unfilled plan honestly.
    const plan = fields.map<FieldPlanItem>((f) => ({
      label: f.label,
      value: "",
      source: "user",
      source_quote: "",
      confidence: 0,
      required: f.required,
      filled: false,
      ...identity(f),
    }));
    return { plan, notes: "No resume or documents on file yet, so nothing could be auto-filled." };
  }

  const user = [
    `MATERIALS:\n${corpus}`,
    `FORM FIELDS (${fields.length}):\n${describeFields(fields)}`,
    "Return the field_plan now.",
  ].join("\n\n");

  const out = await grokStructured<{
    fields?: Array<Partial<FieldPlanItem>>;
    notes?: string;
  }>({
    system: SYSTEM,
    user,
    schema: FIELD_PLAN_SCHEMA,
    schemaName: "field_plan",
    maxTokens: 4000,
  });

  if (!out?.fields) {
    const plan = fields.map<FieldPlanItem>((f) => ({
      label: f.label,
      value: "",
      source: "user",
      source_quote: "",
      confidence: 0,
      required: f.required,
      filled: false,
      ...identity(f),
    }));
    return { plan, notes: "The model didn't return a usable plan; fill these in yourself." };
  }

  // Match the model's items back to the scraped fields by label, so we trust the FORM for `required`
  // and `type` (not the model), and so a field the model dropped still appears (unfilled).
  const byLabel = new Map<string, Partial<FieldPlanItem>>();
  for (const item of out.fields) {
    if (item?.label) byLabel.set(item.label.toLowerCase().trim(), item);
  }

  const plan = fields.map<FieldPlanItem>((f) => {
    const raw = byLabel.get(f.label.toLowerCase().trim());
    const value = (raw?.value ?? "").trim();
    const quote = (raw?.source_quote ?? "").trim();
    let source = (VALUE_SOURCES.includes(raw?.source as FieldValueSource) ? raw!.source : "inferred") as FieldValueSource;
    let confidence = clamp01(raw?.confidence) ?? 0;
    let filled = Boolean(raw?.filled) && value.length > 0;

    // File and password fields are never auto-filled (the user attaches/enters them).
    if (f.type === "file") {
      return { label: f.label, value: "", source: "user", source_quote: "", confidence: 0, required: f.required, filled: false, ...identity(f) };
    }

    // Provenance gate (hard rule #3): a "filled" value MUST be backed by a quote that's really in the
    // materials. If not, keep the value as a low-trust suggestion but mark it unfilled.
    if (filled && source !== "user") {
      const grounded = quote.length > 0 && backs(corpus, quote);
      if (!grounded) {
        filled = false;
        source = "inferred";
        confidence = Math.min(confidence, 0.3);
      }
    }

    return {
      label: f.label,
      value,
      source,
      source_quote: quote, // kept for context even when demoted to an unfilled suggestion
      confidence,
      required: f.required, // trust the FORM, not the model
      filled,
      ...identity(f),
    };
  });

  return { plan, notes: (out.notes ?? "").trim() };
}
