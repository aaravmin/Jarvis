import "server-only";
import { geminiStructured } from "@/lib/llm/gemini";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/google/store";
import { readDocText, findDocsByName, extractFileId } from "@/lib/google/drive";
import { getTemplate, getConnectionType } from "./store";
import { scrubPersonalDetail, extractPlaceholders, CONNECTION_PLACEHOLDER } from "./scrub";
import type { ComposeResult } from "./types";

/**
 * The connection-aware composer. Given a base template (a saved one, a Drive doc, or none) plus a
 * personal connection detail for ONE contact, Claude produces two things at once:
 *   1. the concrete email to send (personal detail woven in naturally), and
 *   2. a GENERALIZED, reusable template + connection TYPE with the personal specifics stripped to a
 *      {{connection}} placeholder, so future contacts with a similar kind of connection are covered.
 *
 * The personal detail is used only to write (1) and is never returned inside (2). A server-side
 * scrubber backstops the model in case it echoes a name/company into the generalized output.
 */

const COMPOSE_TOOL = {
  name: "connection_email",
  description:
    "Return BOTH the concrete email for this contact AND a generalized, reusable template + connection type.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      subject: { type: "string", description: "Concrete email subject for THIS contact." },
      body: { type: "string", description: "Concrete email body; weave the personal connection in naturally." },
      generalized_name: { type: "string", description: "Short name for the reusable template, e.g. 'Warm intro via family connection'." },
      generalized_subject: { type: "string", description: "Reusable subject. Use {{placeholders}}; the connection spot MUST be {{connection}}." },
      generalized_body: {
        type: "string",
        description:
          "Reusable body. Replace every personal specific (names, companies, who-introduced-whom) with placeholders; the connection sentence MUST use {{connection}}. Keep it about the TYPE of connection only.",
      },
      connection_type_label: { type: "string", description: "Short generalized label for the KIND of connection, e.g. 'Parent's professional contact'. No names." },
      connection_type_description: { type: "string", description: "1-2 sentences describing this TYPE of relationship generically. No personal specifics." },
      connection_type_guidance: { type: "string", description: "How to reference this kind of connection in future emails, generically. No names." },
    },
    required: [
      "subject",
      "body",
      "generalized_name",
      "generalized_subject",
      "generalized_body",
      "connection_type_label",
      "connection_type_description",
      "connection_type_guidance",
    ],
  },
};

const SYSTEM = `You write outreach emails AND distill them into reusable, privacy-safe templates.

You produce TWO things via the connection_email tool:
1. The CONCRETE email for this specific contact. Weave in the personal connection naturally and warmly.
   Fill any base-template placeholders from the provided context. Don't invent facts.
2. A GENERALIZED, reusable template + a connection TYPE.

HARD PRIVACY RULE for the generalized outputs (generalized_*, connection_type_*):
- NEVER include personal specifics: no names of people or companies, no "my dad/uncle/friend", no who-
  introduced-whom, no places, no identifying detail of any kind.
- Replace the connection itself with the placeholder ${CONNECTION_PLACEHOLDER}. Other variable bits use
  descriptive placeholders like {{name}}, {{role}}, {{ask}}.
- The connection TYPE describes only the KIND of relationship in the abstract (e.g. "introduced through
  a parent's professional network", "former colleague of a family member"). It must be reusable for any
  future contact with that same kind of connection, so it must contain zero specifics.

Keep the concrete email tight and genuine. Keep the generalized template a clean, fill-in-the-blanks skeleton.`;

export type ComposeInput = {
  contactName: string;
  contactEmail?: string;
  baseTemplateId?: string;
  driveTemplateRef?: string;
  connectionTypeId?: string;
  /** PERSONAL, used only to write the concrete email; never persisted. */
  connectionDetail: string;
  context?: string;
  tone?: string;
};

export async function composeConnectionEmail(
  supabase: SupabaseClient,
  userId: string,
  input: ComposeInput,
): Promise<ComposeResult> {
  // 1. Resolve a base template, if any.
  let baseText = "";
  let baseName: string | undefined;
  if (input.baseTemplateId) {
    const t = await getTemplate(supabase, userId, input.baseTemplateId);
    if (!t) throw new Error("That saved template no longer exists.");
    baseText = `Subject: ${t.subject ?? ""}\n\n${t.body}`;
    baseName = t.name;
  } else if (input.driveTemplateRef && input.driveTemplateRef.trim()) {
    const token = await getValidAccessToken(supabase, userId);
    const fileId = extractFileId(input.driveTemplateRef);
    const doc = fileId
      ? await readDocText(token, fileId)
      : await (async () => {
          const matches = await findDocsByName(token, input.driveTemplateRef!.trim());
          if (!matches.length) throw new Error(`No Google Doc found matching "${input.driveTemplateRef}".`);
          return readDocText(token, matches[0].id);
        })();
    if (!doc.text.trim()) throw new Error(`The template "${doc.name}" appears to be empty.`);
    baseText = doc.text.slice(0, 12000);
    baseName = doc.name;
  }

  // 2. Optionally steer with an existing connection type's guidance.
  let typeGuidance = "";
  if (input.connectionTypeId) {
    const ct = await getConnectionType(supabase, userId, input.connectionTypeId);
    if (ct) {
      typeGuidance = [
        `This contact's connection is of the existing type "${ct.label}".`,
        ct.description ? `Type description: ${ct.description}` : "",
        ct.guidance ? `Past guidance for this type: ${ct.guidance}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  const userMsg = [
    `Contact: ${input.contactName}${input.contactEmail ? ` <${input.contactEmail}>` : ""}`,
    baseText ? `BASE TEMPLATE${baseName ? ` ("${baseName}")` : ""}:\n---\n${baseText}\n---` : "No base template, write from scratch in a warm, concise voice.",
    `PERSONAL CONNECTION (use ONLY for the concrete email, never put this in the generalized outputs):\n${input.connectionDetail.trim()}`,
    typeGuidance,
    input.context ? `Additional context:\n${input.context.trim()}` : "",
    input.tone ? `Tone: ${input.tone.trim()}` : "",
    "Produce both outputs now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await geminiStructured<Record<string, string>>({
    system: SYSTEM,
    user: userMsg,
    schema: COMPOSE_TOOL.input_schema,
    maxTokens: 3000,
  });
  if (!out) throw new Error("The model did not return a draft. Try again or simplify the inputs.");

  // 3. Scrub the generalized outputs as a backstop, then derive the placeholder list from the result.
  const detail = input.connectionDetail;
  const gSubject = scrubPersonalDetail((out.generalized_subject ?? "").trim(), detail);
  const gBody = scrubPersonalDetail((out.generalized_body ?? "").trim(), detail);
  const ctLabel = scrubPersonalDetail((out.connection_type_label ?? "").trim(), detail);
  const ctDesc = scrubPersonalDetail((out.connection_type_description ?? "").trim(), detail);
  const ctGuide = scrubPersonalDetail((out.connection_type_guidance ?? "").trim(), detail);
  const leaked = gSubject.leaked || gBody.leaked || ctLabel.leaked || ctDesc.leaked || ctGuide.leaked;

  const placeholders = extractPlaceholders(gSubject.text, gBody.text);

  return {
    draft: {
      subject: (out.subject ?? "").trim() || (baseName ? `Re: ${baseName}` : "Hello"),
      body: (out.body ?? "").trim(),
    },
    generalized: {
      name: (out.generalized_name ?? "").trim() || `${ctLabel.text || "Connection"} outreach`,
      subject: gSubject.text,
      body: gBody.text,
      placeholders,
    },
    connectionType: {
      label: ctLabel.text || "Personal connection",
      description: ctDesc.text,
      guidance: ctGuide.text,
    },
    baseTemplateName: baseName,
    privacyOk: !leaked,
    privacyNote: leaked
      ? "Jarvis removed a personal detail that slipped into the reusable template, it now stores only the connection type."
      : undefined,
  };
}
