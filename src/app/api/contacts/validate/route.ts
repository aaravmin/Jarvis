import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateAndEnrichContacts } from "@/lib/contacts/validate-enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // bounded Apollo lookups (pooled), but allow headroom for a full batch

/**
 * POST /api/contacts/validate, validate + enrich a set of contacts.
 * Body (pick one targeting mode): { researchRunId } | { contactIds: string[] } | { scope?: "review"|"accepted" }.
 *   • Validates each contact's existing email/LinkedIn (format, plus an Apollo.io cross-check when a
 *     key is set) and fills missing email/company/title/LinkedIn from Apollo.
 *   • Verdicts + filled values are written to field_sources (hard rule #3); contacts stay in Review
 *     (L0) so the user re-approves. RLS scopes every read/write to the caller.
 * Returns { ok, checked, apolloUsed, enrichedCount, flaggedCount, message, results }.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { researchRunId?: string; contactIds?: string[]; scope?: "review" | "accepted"; limit?: number };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const result = await validateAndEnrichContacts(supabase, user.id, {
    researchRunId: body.researchRunId,
    contactIds: Array.isArray(body.contactIds) ? body.contactIds.slice(0, 60) : undefined,
    scope: body.scope === "accepted" ? "accepted" : "review",
    limit: body.limit,
  });

  const message = buildMessage(result);
  return NextResponse.json({ ok: true, ...result, message });
}

function buildMessage(r: {
  checked: number;
  apolloUsed: boolean;
  enrichedCount: number;
  flaggedCount: number;
}): string {
  if (r.checked === 0) return "No contacts to validate.";
  const bits = [`Checked ${r.checked} contact${r.checked === 1 ? "" : "s"}`];
  if (r.enrichedCount > 0) bits.push(`filled missing info on ${r.enrichedCount}`);
  if (r.flaggedCount > 0) bits.push(`flagged ${r.flaggedCount} for a closer look`);
  let msg = bits.join(", ") + ".";
  if (!r.apolloUsed) msg += " (Format-checked only, set APOLLO_API_KEY to cross-check and fill emails.)";
  return msg;
}
