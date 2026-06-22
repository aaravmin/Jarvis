import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apolloEnabled, apolloSearchPeople } from "@/lib/apollo";

export const dynamic = "force-dynamic";

/**
 * POST /api/apollo/search, discover people via Apollo.io. Body: { query, company?, limit? }.
 * Returns { people: ApolloPerson[] }. Read-only (no rows written); importing chosen results is a
 * separate, explicit step (POST /api/apollo/import).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!apolloEnabled()) return NextResponse.json({ error: "Apollo.io isn't configured (set APOLLO_API_KEY).", people: [] }, { status: 503 });

  let body: { query?: string; company?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const query = (body.query ?? "").trim();
  const company = (body.company ?? "").trim();
  if (query.length < 2 && company.length < 2) return NextResponse.json({ error: "Enter a title, keywords, or a company." }, { status: 400 });

  const people = await apolloSearchPeople({ query: query || undefined, company: company || undefined, limit: body.limit });
  return NextResponse.json({ people });
}
