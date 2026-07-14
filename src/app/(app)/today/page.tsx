import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAttention } from "@/lib/priority/load";
import { notionAvailable } from "@/lib/notion/store";
import { TodayView } from "@/components/today/TodayView";
import type { AttentionFeed } from "@/lib/priority/types";

export const dynamic = "force-dynamic";

/**
 * The Today "attention" surface, rendered server-side for the fastest paint (loadAttention runs here
 * directly, no client round trip on first load). /api/today/plan stays available for programmatic use.
 */
export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let feed: AttentionFeed | null = null;
  let loadError: string | null = null;
  let notionOn = false;
  try {
    [feed, notionOn] = await Promise.all([
      loadAttention(supabase, new Date()),
      user ? notionAvailable(supabase, user.id) : Promise.resolve(false),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not build your day.";
  }

  // Newest source we hold whose content is not in the future (calendar events can be) — a cheap proxy
  // for data freshness that drives the "Synced X ago" line and auto-sync-on-open. Best-effort.
  let newestSourceAt: string | null = null;
  if (user) {
    const { data: newest } = await supabase
      .from("sources")
      .select("occurred_at")
      .not("occurred_at", "is", null)
      .lte("occurred_at", new Date().toISOString())
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    newestSourceAt = (newest?.occurred_at as string | null) ?? null;
  }

  if (!feed) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {loadError ?? "Could not build your day."}
        </p>
        <Link
          href="/today"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
        >
          Try again
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <TodayView key={feed.generatedAt} initialFeed={feed} notionEnabled={notionOn} newestSourceAt={newestSourceAt} />
    </div>
  );
}
