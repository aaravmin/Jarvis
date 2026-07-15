import { createClient } from "@/lib/supabase/server";
import { loadReviewItems } from "@/lib/items/review";
import { ReviewList } from "@/components/items/ReviewList";
import { BackfillButton } from "@/components/items/BackfillButton";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  // Everything GOTT derives from your email, meetings, Notion, and calendar lands here first.
  const items = await loadReviewItems(supabase);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">Review</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Approve or dismiss what GOTT found. Nothing is auto-accepted.</p>
        </div>
        <BackfillButton />
      </header>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="text-sm font-semibold text-foreground">Nothing to review</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Hit <span className="font-medium text-foreground">Scan past emails</span> to mine synced messages, or sync new email from the Email tab.
          </p>
        </div>
      ) : (
        <ReviewList items={items} />
      )}
    </div>
  );
}
