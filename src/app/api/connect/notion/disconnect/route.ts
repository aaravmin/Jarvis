import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteNotionConnection } from "@/lib/notion/store";

export const dynamic = "force-dynamic";

/** POST /api/connect/notion/disconnect, remove the stored Notion connection for the signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  await deleteNotionConnection(supabase, user.id);
  return NextResponse.redirect(new URL("/connections?notion=disconnected", request.url), { status: 303 });
}
