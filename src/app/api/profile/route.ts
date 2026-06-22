import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

/** GET /api/profile, the user's profile (or nulls). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ profile: (await loadProfile(supabase)) ?? {} });
}

/** PUT /api/profile, upsert. Body: { headline?, age?, level?, lookingFor? }. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: { headline?: string; age?: number | string; level?: string; lookingFor?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const ageNum = typeof body.age === "string" ? parseInt(body.age, 10) : body.age;
  const { error } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      headline: body.headline?.trim() || null,
      age: Number.isFinite(ageNum as number) ? (ageNum as number) : null,
      level: body.level?.trim() || null,
      looking_for: body.lookingFor?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
