import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listTemplates, listConnectionTypes, saveGeneralizedTemplate } from "@/lib/templates/store";
import { scrubObviousPersonalReferences, extractPlaceholders } from "@/lib/templates/scrub";

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

  // Persistence-boundary backstop: strip possessive relationship phrases ("my dad") a user might
  // re-type in the editable generalized fields. Re-derive placeholders from the saved text.
  const label = scrubObviousPersonalReferences((body.connectionType?.label ?? "").trim()).text;
  const description = scrubObviousPersonalReferences((body.connectionType?.description ?? "").trim()).text;
  const guidance = scrubObviousPersonalReferences((body.connectionType?.guidance ?? "").trim()).text;
  const tSubject = scrubObviousPersonalReferences((body.template?.subject ?? "").trim()).text;
  const tBody = scrubObviousPersonalReferences((body.template?.body ?? "").trim()).text;
  if (!label) return NextResponse.json({ error: "A connection-type label is required." }, { status: 400 });
  if (!tBody) return NextResponse.json({ error: "The template body is empty." }, { status: 400 });

  try {
    const result = await saveGeneralizedTemplate(supabase, user.id, {
      connectionType: { label, description, guidance },
      template: {
        name: (body.template?.name ?? "").trim(),
        subject: tSubject,
        body: tBody,
        placeholders: extractPlaceholders(tSubject, tBody),
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
