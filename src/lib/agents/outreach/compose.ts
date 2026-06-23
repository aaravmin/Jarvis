import "server-only";
import { grokStructured } from "@/lib/llm/grok";
import { audienceGuidance, type Audience } from "./types";
import { webContextForContact } from "@/lib/contacts/research-web";

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
  /** Optional user instructions attached to the template (how to fill it). */
  instructions?: string;
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

Filling a template:
- If a BASE TEMPLATE is provided, follow it closely, keeping the user's wording, structure, and the projects they mention.
- The template may contain bracketed slots, for example [enter name], [student/alum], [what they do], [something they did/worked on], [create connection to what they do], or conditionals like [if they were a transfer student put it here] or [if someone referred me put it here]. These are INSTRUCTIONS telling you what to write there, they are NOT literal text to copy.
- Fill each slot with specific, accurate content drawn from the CONTACT info, the WEB RESEARCH, and the SENDER info. You SHOULD infer reasonable specifics about the contact from the research (their role, focus, a notable thing they built or worked on) to fill "what they do" and "what they worked on", and form a genuine connection to the user's interests. Be specific, not generic.
- For a conditional slot [if X ...], include that content only when X is actually true from the provided facts; otherwise drop it and smooth the sentence so it still reads naturally.
- NEVER leave a literal bracket, placeholder, or instruction wording in the final email. If you truly cannot fill a slot from the available facts, rewrite that sentence so it flows without it rather than leaving a gap.

Honesty:
- Never invent facts the research does not support (fake titles, achievements, mutual connections, or schools). Infer only what the provided facts reasonably show; when unsure, keep that part lighter rather than fabricating.
- Speak in the user's voice using their profile/materials. Don't claim accomplishments the user doesn't have.

Style:
- Tailor tone and the ask to the AUDIENCE guidance. Concise and skimmable, one clear ask, no corporate filler or over-flattery.
- Return subject + body via the schema. Use the contact's name naturally; do not include a signature block with fake contact details.
- Follow any explicit INSTRUCTIONS provided for this email.`;

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

  // Research the contact on the web so the model can fill "what they do / worked on" slots with real,
  // specific facts (their record alone is often thin). Best-effort.
  const webContext = await webContextForContact(c.name, c.company, c.roleTitle);

  const user = [
    `AUDIENCE: ${input.audience}\nAUDIENCE GUIDANCE: ${audienceGuidance(input.audience)}`,
    `CONTACT:\n${contactLines.join("\n")}`,
    webContext ? `WEB RESEARCH about ${c.name} (use this to fill what they do and what they have worked on; do not invent beyond it):\n${webContext}` : "",
    input.senderDigest ? `ABOUT ME (the sender):\n${input.senderDigest}` : "",
    input.goal ? `MY GOAL FOR THIS EMAIL (the ask):\n${input.goal}` : "",
    input.instructions ? `INSTRUCTIONS for this email (follow them):\n${input.instructions}` : "",
    input.templateText ? `BASE TEMPLATE to follow (fill its bracketed slots, leave no brackets):\n---\n${input.templateText.slice(0, 6000)}\n---` : "",
    "Write the email now, with every bracketed slot filled in or smoothed away.",
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
