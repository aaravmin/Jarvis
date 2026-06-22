import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { composeConnectionEmail } from "@/lib/templates/compose";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/templates/compose, adapt a base template to a contact's personal connection. Returns the
 * concrete draft AND a proposed generalized template + connection type. Saves NOTHING (autonomy L0:
 * the user reviews, then saves the draft to Gmail and/or the generalized template separately).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: {
    contactName?: string;
    contactEmail?: string;
    baseTemplateId?: string;
    driveTemplateRef?: string;
    connectionTypeId?: string;
    connectionDetail?: string;
    context?: string;
    tone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const contactName = (body.contactName ?? "").trim();
  const connectionDetail = (body.connectionDetail ?? "").trim();
  if (!contactName) return NextResponse.json({ error: "A contact name is required." }, { status: 400 });
  if (connectionDetail.length < 3) {
    return NextResponse.json({ error: "Describe the connection so Jarvis can weave it in." }, { status: 400 });
  }

  try {
    const result = await composeConnectionEmail(supabase, user.id, {
      contactName,
      contactEmail: body.contactEmail?.trim() || undefined,
      baseTemplateId: body.baseTemplateId?.trim() || undefined,
      driveTemplateRef: body.driveTemplateRef?.trim() || undefined,
      connectionTypeId: body.connectionTypeId?.trim() || undefined,
      connectionDetail,
      context: body.context?.trim() || undefined,
      tone: body.tone?.trim() || undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not compose the email." },
      { status: 500 },
    );
  }
}
