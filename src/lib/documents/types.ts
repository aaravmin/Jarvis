/**
 * Documents, the user's application materials (resumes, grant narratives, bios, writing samples).
 * These are the Application & Outreach Agent's MEMORY: what it fills forms and tailors outreach FROM.
 * The binary lives in the private 'documents' Storage bucket; `extractedText` is the readable body the
 * model actually consumes (a document with no file but pasted text is valid, and vice-versa).
 */

export type DocType = "resume" | "grant_material" | "bio" | "writing_sample" | "other";

export const DOC_TYPES: DocType[] = ["resume", "grant_material", "bio", "writing_sample", "other"];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  resume: "Resume / CV",
  grant_material: "Grant material",
  bio: "Bio",
  writing_sample: "Writing sample",
  other: "Other",
};

export type AppDocument = {
  id: string;
  name: string;
  docType: DocType;
  storagePath?: string;
  mimeType?: string;
  fileSize?: number;
  extractedText?: string;
  isDefault: boolean;
  createdAt: string;
};
