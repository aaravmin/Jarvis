import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadReviewRuns } from "@/lib/research/load";
import { loadOpportunityReviewRuns } from "@/lib/agents/opportunity/load";
import { loadReviewItems } from "@/lib/items/review";
import { ResearchRunCard } from "@/components/ResearchRunCard";
import { OpportunityRunCard } from "@/components/OpportunityRunCard";
import { ReviewItemCard } from "@/components/items/ReviewItemCard";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
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

  if (entries.length === 0) {
    return <EmptyState icon={Inbox} title="Nothing to review" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {entries.map((entry) =>
        entry.kind === "item" ? (
          <ReviewItemCard key={`i-${entry.item.id}`} item={entry.item} />
        ) : entry.kind === "people" ? (
          <ResearchRunCard key={`p-${entry.run.id}`} run={entry.run} />
        ) : (
          <OpportunityRunCard key={`o-${entry.run.id}`} run={entry.run} />
        ),
      )}
    </div>
  );
}
