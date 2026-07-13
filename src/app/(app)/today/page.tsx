import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadAttention } from "@/lib/priority/load";
import { TodayView } from "@/components/today/TodayView";
import type { AttentionFeed } from "@/lib/priority/types";

export const dynamic = "force-dynamic";

/**
 * The Today "attention" surface, rendered server-side for the fastest paint (loadAttention runs here
 * directly, no client round trip on first load). /api/today/plan stays available for programmatic use.
 */
export default async function TodayPage() {
  const supabase = await createClient();

  let feed: AttentionFeed | null = null;
  let loadError: string | null = null;
  try {
    feed = await loadAttention(supabase, new Date());
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not build your day.";
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
      <TodayView key={feed.generatedAt} initialFeed={feed} />
    </div>
  );
}
