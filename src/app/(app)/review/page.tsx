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
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing to review"
        description="Suggestions wait here for your approval before becoming real items — the heart of Jarvis's 'suggest first, automate later' design. Ask the Contact agent to find people or the Opportunity agent to find programs/jobs/hackathons (⌘K), and the matches land here, each with its source, the exact quote, and a confidence score."
        deliveredBy="Phase 1 · P1-T4 (people + opportunity discovery live now)"
      />
    );
  }

  const runCount = entries.length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm text-muted">
        {runCount} {runCount === 1 ? "run" : "runs"} awaiting review. Nothing is added to Contacts or
        Opportunities until you accept it.
      </p>
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
