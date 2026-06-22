import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runApplication } from "@/lib/agents/application/run";
import type { ApplicationKind } from "@/lib/agents/application/types";

// Reads a form + a Grok grounding pass, can take ~30-60s. Server-side; tokens never touch the browser.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID_KINDS: ApplicationKind[] = ["job", "grant", "other"];

/**
 * POST /api/applications/prepare, prepare an application at a URL.
 * Body: { targetUrl, kind?, opportunityId? }. Returns the ApplicationRunView (status needs_review).
 * The agent NEVER submits, the user reviews the field_plan and submits themselves (hard rule #5).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { targetUrl?: string; kind?: string; opportunityId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const targetUrl = (body.targetUrl ?? "").trim();
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return NextResponse.json({ error: "Enter a valid http(s) application link." }, { status: 400 });
  }
  const kind = (VALID_KINDS as string[]).includes(body.kind ?? "") ? (body.kind as ApplicationKind) : "job";

  const result = await runApplication(supabase, user.id, {
    targetUrl,
    kind,
    opportunityId: body.opportunityId?.trim() || undefined,
  });
  if (result.status === "reused") {
    return NextResponse.json({ runId: result.runId, status: "running", reused: true });
  }
  if (result.status === "error") {
    return NextResponse.json({ runId: result.runId, status: "error", error: result.error }, { status: 500 });
  }
  return NextResponse.json(result.view);
}
