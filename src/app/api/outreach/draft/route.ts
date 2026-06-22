import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runOutreach } from "@/lib/agents/outreach/run";
import { AUDIENCES, type Audience } from "@/lib/agents/outreach/types";

// Loads the contact + a Grok drafting pass. Server-side; tokens never touch the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID = AUDIENCES.map((a) => a.value) as string[];

/**
 * POST /api/outreach/draft, draft a tailored outreach email to a contact.
 * Body: { contactId, audience, goal?, templateId? }. Returns the OutreachRunView (status 'drafted').
 * Draft only, nothing is sent; saving into Gmail is a separate step.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { contactId?: string; audience?: string; goal?: string; templateId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const contactId = (body.contactId ?? "").trim();
  if (!contactId) return NextResponse.json({ error: "Pick a contact to write to." }, { status: 400 });
  const audience = (VALID.includes(body.audience ?? "") ? body.audience : "other") as Audience;

  const result = await runOutreach(supabase, user.id, {
    contactId,
    audience,
    goal: body.goal?.trim() || undefined,
    templateId: body.templateId?.trim() || undefined,
  });
  if (result.status === "error") {
    return NextResponse.json({ runId: result.runId, status: "error", error: result.error }, { status: 500 });
  }
  return NextResponse.json(result.view);
}
