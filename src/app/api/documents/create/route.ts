import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createDocument } from "@/lib/documents/store";
import { DOC_TYPES, type DocType } from "@/lib/documents/types";

export const dynamic = "force-dynamic";

const MAX_TEXT = 200_000; // generous for a resume/grant narrative; guards against a runaway paste

/**
 * POST /api/documents/create — record an uploaded/pasted document's metadata.
 * The client uploads the binary straight to the private 'documents' Storage bucket (RLS-scoped to the
 * user's own folder) and sends us the resulting { storagePath, ... } plus the extracted text. A
 * text-only document (no file) is allowed too. Supabase is the system of record (hard rule #1).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: {
    name?: string;
    docType?: string;
    storagePath?: string;
    mimeType?: string;
    fileSize?: number;
    extractedText?: string;
    isDefault?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const docType = (body.docType ?? "resume") as DocType;
  if (!DOC_TYPES.includes(docType)) {
    return NextResponse.json({ error: "Unknown document type." }, { status: 400 });
  }
  const text = (body.extractedText ?? "").trim();
  if (text.length > MAX_TEXT) {
    return NextResponse.json({ error: "That document's text is too large to store." }, { status: 400 });
  }
  // Mirror the DB content check: a document needs a file OR some readable text.
  if (!body.storagePath && !text) {
    return NextResponse.json(
      { error: "Add a file or paste the document text so the agent can read it." },
      { status: 400 },
    );
  }
  // The storage path must live under the user's own folder (defense in depth alongside Storage RLS).
  if (body.storagePath && !body.storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
  }

  try {
    const doc = await createDocument(supabase, user.id, {
      name: (body.name ?? "").trim(),
      docType,
      storagePath: body.storagePath,
      mimeType: body.mimeType,
      fileSize: typeof body.fileSize === "number" ? body.fileSize : undefined,
      extractedText: text || undefined,
      isDefault: Boolean(body.isDefault),
    });
    return NextResponse.json({ ok: true, document: doc });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the document." },
      { status: 500 },
    );
  }
}
