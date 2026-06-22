import "server-only";
import { geminiStructured } from "@/lib/llm/gemini";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/google/store";
import { readDocText, findDocsByName, extractFileId } from "@/lib/google/drive";

/**
 * draft-from-template: read a Google Drive template doc and have Gemini fill it into an email draft
 * for a given recipient/context. Read-only + draft-only, nothing is sent (that needs the gmail.send
 * write scope, added later). Returns the subject + body for the user to review/copy.
 */

const DRAFT_TOOL = {
  name: "email_draft",
  description: "Return the finished email draft (subject + body) built from the template.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["subject", "body"],
  },
};

const SYSTEM = `You draft an email from the user's TEMPLATE, filling its placeholders using the provided context.
Rules:
- Keep the template's tone, structure, and intent. Fill placeholders ({{name}}, [Company], blanks) from the context.
- Do NOT invent facts (titles, dates, achievements) that aren't in the template or context. If a placeholder can't be filled, leave a clear [bracketed] gap.
- Return a concise subject and the full body via the email_draft tool.`;

export type EmailDraft = { subject: string; body: string; templateName?: string; templateUrl?: string };

/**
 * Draft an email. With a Drive template, fill its placeholders; WITHOUT one, draft from scratch given
 * the recipient + context. Draft-only (no send, that needs the gmail.send write scope).
 */
export async function draftEmailFromTemplate(
  supabase: SupabaseClient,
  userId: string,
  templateRef: string | undefined,
  opts: { to?: string; context?: string } = {},
): Promise<EmailDraft> {
  let doc: { name: string; text: string; webViewLink?: string } | null = null;
  if (templateRef && templateRef.trim()) {
    const token = await getValidAccessToken(supabase, userId);
    const fileId = extractFileId(templateRef);
    if (fileId) {
      doc = await readDocText(token, fileId);
    } else {
      const matches = await findDocsByName(token, templateRef);
      if (!matches.length) throw new Error(`No Google Doc found matching "${templateRef}".`);
      doc = await readDocText(token, matches[0].id);
    }
    if (!doc.text.trim()) throw new Error(`The template "${doc.name}" appears to be empty.`);
  }

  const userMsg = [
    doc ? `TEMPLATE (from Google Doc "${doc.name}"):\n---\n${doc.text.slice(0, 12000)}\n---` : "Draft a concise, warm email from scratch (no template).",
    opts.to ? `Recipient: ${opts.to}` : "",
    opts.context ? `Context:\n${opts.context}` : "",
    "Draft the email now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await geminiStructured<{ subject?: string; body?: string }>({
    system: SYSTEM,
    user: userMsg,
    schema: DRAFT_TOOL.input_schema,
    maxTokens: 2000,
  });
  if (!out) throw new Error("The model did not return a draft. Try again or simplify the template.");

  return {
    subject: (out.subject ?? "").trim() || (doc ? `Re: ${doc.name}` : "Hello"),
    body: (out.body ?? "").trim(),
    templateName: doc?.name,
    templateUrl: doc?.webViewLink,
  };
}
