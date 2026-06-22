import "server-only";
import { grokStructured } from "@/lib/llm/grok";
import { audienceGuidance, type Audience } from "./types";

/**
 * The Outreach composer (Grok). Writes a tailored email to one contact, branching tone on the audience.
 * It grounds the email in what we KNOW about the recipient, especially their current_work (Axis B) -
 * and in the user's own profile/materials. It does not invent facts about the recipient.
 *
 * Draft only: this returns {subject, body}; saving to Gmail is a separate, user-initiated step.
 */

export type OutreachContact = {
  name: string;
  email?: string;
  roleTitle?: string;
  company?: string;
  /** What the person is actively working on right now, the strongest hook for a relevant email. */
  currentWork?: string;
  /** Why they matter to the user (contacts.relevance) and any background we have. */
  relevance?: string;
  background?: string;
  /** How the user knows them (connection note), if any. */
  connectionNote?: string;
};

export type OutreachComposeInput = {
  contact: OutreachContact;
  audience: Audience;
  /** What the user wants out of this outreach (the ask). */
  goal?: string;
  /** The user's own one-block profile digest, so the email speaks in their voice/standing. */
  senderDigest?: string;
  /** An optional base template's text to adapt. */
  templateText?: string;
};

const OUTREACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string", description: "A specific, non-generic subject line." },
    body: { type: "string", description: "The full email body, ready to review and send." },
  },
  required: ["subject", "body"],
};

const SYSTEM = `You write a single, genuine outreach email from the USER to a specific CONTACT.

Rules:
- Tailor tone and the ask to the AUDIENCE guidance you're given.
- Ground the email in what's actually provided about the contact, especially what they're currently working on. Reference it specifically; that's what makes outreach land.
- NEVER invent facts about the contact (titles, achievements, mutual friends) that aren't in the context. If you have little to go on, keep it short and honest rather than padding with made-up specifics.
- Speak in the user's voice using their profile/materials. Don't claim accomplishments the user doesn't have.
- Keep it concise and skimmable. One clear ask. No corporate filler, no over-flattery.
- If a base template is provided, adapt it; otherwise write from scratch.
- Return subject + body via the schema. Use the contact's name naturally; do not include a signature block with fake contact details.`;

export async function composeOutreach(input: OutreachComposeInput): Promise<{ subject: string; body: string }> {
  const c = input.contact;
  const contactLines = [
    `Name: ${c.name}`,
    c.roleTitle && `Role: ${c.roleTitle}`,
    c.company && `Company/Org: ${c.company}`,
    c.currentWork && `Currently working on: ${c.currentWork}`,
    c.relevance && `Why they matter to me: ${c.relevance}`,
    c.background && `Background: ${c.background}`,
    c.connectionNote && `How I know them: ${c.connectionNote}`,
  ].filter(Boolean);

  const user = [
    `AUDIENCE: ${input.audience}\nAUDIENCE GUIDANCE: ${audienceGuidance(input.audience)}`,
    `CONTACT:\n${contactLines.join("\n")}`,
    input.senderDigest ? `ABOUT ME (the sender):\n${input.senderDigest}` : "",
    input.goal ? `MY GOAL FOR THIS EMAIL (the ask):\n${input.goal}` : "",
    input.templateText ? `BASE TEMPLATE to adapt:\n---\n${input.templateText.slice(0, 6000)}\n---` : "",
    "Write the email now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await grokStructured<{ subject?: string; body?: string }>({
    system: SYSTEM,
    user,
    schema: OUTREACH_SCHEMA,
    schemaName: "outreach_email",
    maxTokens: 2000,
  });
  if (!out) throw new Error("The model didn't return a draft. Try again.");

  return {
    subject: (out.subject ?? "").trim() || `Hello ${c.name.split(" ")[0] ?? ""}`.trim(),
    body: (out.body ?? "").trim(),
  };
}
