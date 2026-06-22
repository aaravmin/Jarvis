import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadReviewRuns } from "@/lib/research/load";
import { loadOpportunityReviewRuns } from "@/lib/agents/opportunity/load";
import { loadReviewItems } from "@/lib/items/review";
import { ResearchRunCard } from "@/components/ResearchRunCard";
import { OpportunityRunCard } from "@/components/OpportunityRunCard";
import { ReviewItemCard } from "@/components/items/ReviewItemCard";
import { BackfillButton } from "@/components/items/BackfillButton";
import { apolloEnabled } from "@/lib/apollo";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  const apolloOn = apolloEnabled();
  // Email-derived items + both research agents land their suggestions here; one queue, newest first.
  const [items, peopleRuns, opportunityRuns] = await Promise.all([
    loadReviewItems(supabase),
    loadReviewRuns(supabase),
    loadOpportunityReviewRuns(supabase),
  ]);

  const entries = [
    ...items.map((item) => ({ kind: "item" as const, createdAt: item.createdAt, item })),
    ...peopleRuns.map((run) => ({ kind: "people" as const, createdAt: run.createdAt, run })),
    ...opportunityRuns.map((run) => ({ kind: "opportunity" as const, createdAt: run.createdAt, run })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Inbox className="h-5 w-5 text-accent" /> Review
          </h1>
          <p className="mt-1 text-sm text-muted">
            Action items Jarvis found in your email and meetings, approve or dismiss each. Nothing is
            auto-accepted.
          </p>
        </div>
        <BackfillButton />
      </header>

      {entries.length === 0 ? (
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
        entries.map((entry) =>
          entry.kind === "item" ? (
            <ReviewItemCard key={`i-${entry.item.id}`} item={entry.item} />
          ) : entry.kind === "people" ? (
            <ResearchRunCard key={`p-${entry.run.id}`} run={entry.run} apolloEnabled={apolloOn} />
          ) : (
            <OpportunityRunCard key={`o-${entry.run.id}`} run={entry.run} />
          ),
        )
      )}
    </div>
  );
}
