/** A web source the assistant cited. */
export type AskCitation = { url: string; title?: string; quote?: string };

/** A local file the assistant read while answering. */
export type AskFileRef = { path: string; bytes: number };

/** The assistant's answer plus its provenance (web sources + files touched). */
export type AskResponse = {
  answer: string;
  citations: AskCitation[];
  files: AskFileRef[];
};
