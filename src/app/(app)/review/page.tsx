import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadReviewItems } from "@/lib/items/review";
import { ReviewItemCard } from "@/components/items/ReviewItemCard";
import { BackfillButton } from "@/components/items/BackfillButton";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  // Everything Jarvis derives from your email, meetings, Notion, and calendar lands here first.
  const items = await loadReviewItems(supabase);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Inbox className="h-5 w-5 text-accent" /> Review
          </h1>
          <p className="mt-1 text-sm text-muted">
            Action items Jarvis found in your email, meetings, and Notion, approve or dismiss each.
            Nothing is auto-accepted.
          </p>
        </div>
        <BackfillButton />
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Inbox className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">Nothing to review yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Hit <span className="font-medium text-foreground">Scan past emails</span> to mine messages
            you&apos;ve already synced for tasks and deadlines, or sync new email from the Email tab.
          </p>
        </div>
      ) : (
        items.map((item) => <ReviewItemCard key={item.id} item={item} />)
      )}
    </div>
  );
}
