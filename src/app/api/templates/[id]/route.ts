import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteTemplate } from "@/lib/templates/store";

export const dynamic = "force-dynamic";

/** DELETE /api/templates/:id — remove a saved template (RLS guarantees it's the user's own). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing template id." }, { status: 400 });

  try {
    await deleteTemplate(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete the template." },
      { status: 500 },
    );
  }
}
