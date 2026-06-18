import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTokenWithScope } from "@/lib/google/store";
import { SCOPE_CALENDAR_EVENTS } from "@/lib/google/oauth";
import { createEvent } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/google/calendar/create-event — { summary, startISO?|startDate?, endISO?, endDate?,
 * description?, location? }. Creates a real event on the primary calendar. Times must be already
 * resolved by the caller (hard rule #2 — the LLM never computes them). Requires calendar.events.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: {
    summary?: string;
    startISO?: string;
    endISO?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
    location?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const summary = (body.summary ?? "").trim();
  if (!summary) return NextResponse.json({ error: "An event title is required." }, { status: 400 });
  if (!body.startISO && !body.startDate) {
    return NextResponse.json({ error: "A start time (startISO) or all-day date (startDate) is required." }, { status: 400 });
  }

  try {
    const token = await getTokenWithScope(supabase, user.id, SCOPE_CALENDAR_EVENTS, "adding events to your calendar");
    const event = await createEvent(token, {
      summary,
      startISO: body.startISO ?? "",
      endISO: body.endISO,
      startDate: body.startDate,
      endDate: body.endDate,
      description: body.description?.trim() || undefined,
      location: body.location?.trim() || undefined,
    });
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the event." },
      { status: 500 },
    );
  }
}
