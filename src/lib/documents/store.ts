import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppDocument, DocType } from "./types";

/**
 * CRUD for the user's application documents. Supabase is the system of record (hard rule #1); RLS
 * scopes every row to the signed-in user. The binary lives in the private 'documents' Storage bucket —
 * this layer owns the metadata row and keeps the two in sync (deleting a row also removes the object).
 */

const STORAGE_BUCKET = "documents";

type DocumentRow = {
  id: string;
  name: string;
  doc_type: DocType;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  extracted_text: string | null;
  is_default: boolean;
  created_at: string;
};

const COLUMNS = "id, name, doc_type, storage_path, mime_type, file_size, extracted_text, is_default, created_at";

function rowToDocument(r: DocumentRow): AppDocument {
  return {
    id: r.id,
    name: r.name,
    docType: r.doc_type,
    storagePath: r.storage_path ?? undefined,
    mimeType: r.mime_type ?? undefined,
    fileSize: r.file_size ?? undefined,
    extractedText: r.extracted_text ?? undefined,
    isDefault: r.is_default ?? false,
    createdAt: r.created_at,
  };
}

export async function listDocuments(supabase: SupabaseClient, userId: string): Promise<AppDocument[]> {
  const { data } = await supabase
    .from("documents")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  return ((data as DocumentRow[] | null) ?? []).map(rowToDocument);
}

export async function getDocument(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<AppDocument | null> {
  const { data } = await supabase
    .from("documents")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  return data ? rowToDocument(data as DocumentRow) : null;
}

/**
 * The materials the agent reads when preparing an application/outreach. Returns the default resume (or
 * the most recent resume if none is marked default) plus all other documents that carry readable text.
 */
export async function loadAgentMaterials(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ resume?: AppDocument; materials: AppDocument[] }> {
  const all = await listDocuments(supabase, userId);
  const resumes = all.filter((d) => d.docType === "resume");
  const resume = resumes.find((d) => d.isDefault) ?? resumes[0];
  const materials = all.filter((d) => d.id !== resume?.id && (d.extractedText?.trim().length ?? 0) > 0);
  return { resume, materials };
}

export type NewDocument = {
  name: string;
  docType: DocType;
  storagePath?: string;
  mimeType?: string;
  fileSize?: number;
  extractedText?: string;
  isDefault?: boolean;
};

export async function createDocument(
  supabase: SupabaseClient,
  userId: string,
  doc: NewDocument,
): Promise<AppDocument> {
  // Marking this default clears the flag on the user's other docs of the same type (one default each).
  if (doc.isDefault) {
    await supabase
      .from("documents")
      .update({ is_default: false })
      .eq("user_id", userId)
      .eq("doc_type", doc.docType);
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      name: doc.name.trim() || "Untitled",
      doc_type: doc.docType,
      storage_path: doc.storagePath ?? null,
      mime_type: doc.mimeType ?? null,
      file_size: doc.fileSize ?? null,
      extracted_text: doc.extractedText?.trim() || null,
      is_default: doc.isDefault ?? false,
    })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`Could not save the document: ${error.message}`);
  return rowToDocument(data as DocumentRow);
}

export async function setDefaultDocument(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const doc = await getDocument(supabase, userId, id);
  if (!doc) throw new Error("Document not found.");
  await supabase
    .from("documents")
    .update({ is_default: false })
    .eq("user_id", userId)
    .eq("doc_type", doc.docType);
  await supabase
    .from("documents")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
}

export async function deleteDocument(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  const doc = await getDocument(supabase, userId, id);
  if (!doc) return;
  // Remove the stored object first; the metadata row is the source of truth, so drop it regardless.
  if (doc.storagePath) {
    await supabase.storage.from(STORAGE_BUCKET).remove([doc.storagePath]).catch(() => {});
  }
  await supabase.from("documents").delete().eq("user_id", userId).eq("id", id);
}
