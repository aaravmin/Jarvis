/** A web source the assistant cited. */
export type AskCitation = { url: string; title?: string; quote?: string };

/** A local file the assistant read while answering. */
export type AskFileRef = { path: string; bytes: number };

/** Something the assistant DID this turn (created an event, drafted an email, saved a template). */
export type AskActionRef = {
  kind: "event" | "draft" | "template";
  label: string;
  url?: string;
  /** The deterministic, code-resolved fact (e.g. the parsed event time, the draft recipient) shown
   *  under the link so the user always sees the real outcome, not just the model's paraphrase. */
  detail?: string;
};

/** The assistant's answer plus its provenance (web sources + files touched + actions taken). */
export type AskResponse = {
  answer: string;
  citations: AskCitation[];
  files: AskFileRef[];
  actions: AskActionRef[];
};
