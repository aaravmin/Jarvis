import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disconnect } from "@/lib/google/store";

export const dynamic = "force-dynamic";

/** POST /api/connect/google/disconnect, remove the stored Google connection for the signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  await disconnect(supabase, user.id);
  return NextResponse.redirect(new URL("/connections?google=disconnected", request.url), { status: 303 });
}
