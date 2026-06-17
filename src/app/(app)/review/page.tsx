import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadReviewRuns } from "@/lib/research/load";
import { ResearchRunCard } from "@/components/ResearchRunCard";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  const runs = await loadReviewRuns(supabase);

  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing to review"
        description="Suggestions wait here for your approval before becoming real items — the heart of Jarvis's 'suggest first, automate later' design. Ask Jarvis to find a cohort of people (⌘K) and the matches land here, each with its source, the exact quote, and a confidence score."
        deliveredBy="Phase 1 · P1-T4 (people discovery live now)"
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-sm text-muted">
        {runs.length} research {runs.length === 1 ? "run" : "runs"} awaiting review. Nothing is added
        to People until you accept it.
      </p>
      {runs.map((run) => (
        <ResearchRunCard key={run.id} run={run} />
      ))}
    </div>
  );
}
