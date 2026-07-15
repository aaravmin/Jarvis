import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAttention } from "@/lib/priority/load";
import { loadReviewItems } from "@/lib/items/review";
import { notionAvailable } from "@/lib/notion/store";
import { TodayView } from "@/components/today/TodayView";
import { Button } from "@/components/ui/button";
import type { AttentionFeed } from "@/lib/priority/types";
import type { ReviewItem } from "@/lib/items/review";

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
  // Pending suggestions (status='review') now surface inline at the end of Today, not on a separate
  // tab. They still require an explicit Accept/Dismiss (L0 gate, hard rule #5); nothing auto-accepts.
  let reviewItems: ReviewItem[] = [];
  try {
    [feed, notionOn, reviewItems] = await Promise.all([
      loadAttention(supabase, new Date()),
      user ? notionAvailable(supabase, user.id) : Promise.resolve(false),
      loadReviewItems(supabase),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not build your day.";
  }

  // Newest source we hold whose content is not in the future (calendar events can be) - a cheap proxy
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
      <div className="mx-auto w-full max-w-6xl space-y-3">
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError ?? "Could not build your day."}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/today">Try again</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <TodayView
        key={feed.generatedAt}
        initialFeed={feed}
        notionEnabled={notionOn}
        newestSourceAt={newestSourceAt}
        reviewItems={reviewItems}
      />
    </div>
  );
}
