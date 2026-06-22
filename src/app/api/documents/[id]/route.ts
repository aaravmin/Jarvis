import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteDocument, setDefaultDocument } from "@/lib/documents/store";

export const dynamic = "force-dynamic";

/** PATCH /api/documents/:id, { setDefault: true } marks this the default doc of its type. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing document id." }, { status: 400 });

  let body: { setDefault?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.setDefault) await setDefaultDocument(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the document." },
      { status: 500 },
    );
  }
}

/** DELETE /api/documents/:id, remove the metadata row and its stored object (RLS scopes to the user). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing document id." }, { status: 400 });

  try {
    await deleteDocument(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete the document." },
      { status: 500 },
    );
  }
}
