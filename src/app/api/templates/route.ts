import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listTemplates, listConnectionTypes, saveGeneralizedTemplate } from "@/lib/templates/store";

export const dynamic = "force-dynamic";

/** GET /api/templates — list saved templates + connection types for the current user. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [templates, connectionTypes] = await Promise.all([
    listTemplates(supabase, user.id),
    listConnectionTypes(supabase, user.id),
  ]);
  return NextResponse.json({ templates, connectionTypes });
}

/**
 * POST /api/templates — persist a GENERALIZED template + its connection type. By contract this body
 * carries only the reusable, scrubbed artifact: the personal connection detail is never accepted or
 * stored here (we read only these named fields and ignore anything else).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: {
    connectionType?: { label?: string; description?: string; guidance?: string };
    template?: { name?: string; subject?: string; body?: string; placeholders?: string[] };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const label = (body.connectionType?.label ?? "").trim();
  const tBody = (body.template?.body ?? "").trim();
  if (!label) return NextResponse.json({ error: "A connection-type label is required." }, { status: 400 });
  if (!tBody) return NextResponse.json({ error: "The template body is empty." }, { status: 400 });

  try {
    const result = await saveGeneralizedTemplate(supabase, user.id, {
      connectionType: {
        label,
        description: (body.connectionType?.description ?? "").trim(),
        guidance: (body.connectionType?.guidance ?? "").trim(),
      },
      template: {
        name: (body.template?.name ?? "").trim(),
        subject: (body.template?.subject ?? "").trim(),
        body: tBody,
        placeholders: Array.isArray(body.template?.placeholders) ? body.template!.placeholders : [],
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the template." },
      { status: 500 },
    );
  }
}
