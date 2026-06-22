import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteConnectionType } from "@/lib/templates/store";

export const dynamic = "force-dynamic";

/** DELETE /api/connection-types/:id, remove a connection type. Linked templates keep working; their
 * connection_type_id is set null by the FK's ON DELETE SET NULL. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    await deleteConnectionType(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete the connection type." },
      { status: 500 },
    );
  }
}
