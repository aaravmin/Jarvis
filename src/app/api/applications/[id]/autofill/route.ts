import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autofillApplication } from "@/lib/agents/application/autofill";

export const dynamic = "force-dynamic";
// Driving a real browser (nav + per-field fills) can take a little while; give it room.
export const maxDuration = 120;

/**
 * POST /api/applications/:id/autofill — open a real browser and type the grounded field_plan into the
 * live form, leaving the window OPEN for the user to review and submit. Never submits (hard rule #5).
 * Requires JARVIS_BROWSER=playwright; otherwise returns { unavailable:true } and the UI stays manual.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing application id." }, { status: 400 });

  const result = await autofillApplication(supabase, user.id, id, Date.now());
  // 200 even when unavailable/failed: the body carries a precise, user-facing message the card renders.
  return NextResponse.json(result);
}
