import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestNotion } from "@/lib/notion/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST /api/notion/sync, pull recently edited Notion pages shared with the integration and extract items. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const result = await ingestNotion(supabase, user.id);

    if (!result.enabled) {
      return NextResponse.json({
        ...result,
        message: "Notion isn't connected. Set NOTION_API_KEY (a Notion internal integration token) to enable it.",
      });
    }
    if (result.error) {
      return NextResponse.json({ ...result, message: result.error });
    }

    const bits = [
      `${result.imported} page${result.imported === 1 ? "" : "s"} synced`,
      result.itemsExtracted ? `${result.itemsExtracted} to review` : null,
    ].filter(Boolean);
    return NextResponse.json({ ...result, message: bits.join(" · ") || "Up to date" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Notion sync failed." }, { status: 500 });
  }
}
