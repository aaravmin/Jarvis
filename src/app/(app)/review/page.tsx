import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadReviewRuns } from "@/lib/research/load";
import { loadOpportunityReviewRuns } from "@/lib/agents/opportunity/load";
import { ResearchRunCard } from "@/components/ResearchRunCard";
import { OpportunityRunCard } from "@/components/OpportunityRunCard";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  // Both research agents land their suggestions here; merge into one queue, newest first.
  const [peopleRuns, opportunityRuns] = await Promise.all([
    loadReviewRuns(supabase),
    loadOpportunityReviewRuns(supabase),
  ]);

  const entries = [
    ...peopleRuns.map((run) => ({ kind: "people" as const, createdAt: run.createdAt, run })),
    ...opportunityRuns.map((run) => ({ kind: "opportunity" as const, createdAt: run.createdAt, run })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (entries.length === 0) {
    return <EmptyState icon={Inbox} title="Nothing to review" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {entries.map((entry) =>
        entry.kind === "people" ? (
          <ResearchRunCard key={`p-${entry.run.id}`} run={entry.run} />
        ) : (
          <OpportunityRunCard key={`o-${entry.run.id}`} run={entry.run} />
        ),
      )}
    </div>
  );
}
