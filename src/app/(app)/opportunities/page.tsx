import { Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadAcceptedOpportunities } from "@/lib/agents/opportunity/load";
import { entityIdsForGoal } from "@/lib/goals/load";
import { OpportunityCard } from "@/components/OpportunityCard";
import { FindOpportunitiesBar } from "@/components/FindOpportunitiesBar";
import { ManualOpportunityForm } from "@/components/manual/ManualOpportunityForm";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const supabase = await createClient();
  let opportunities = await loadAcceptedOpportunities(supabase);
  if (goal) {
    const ids = new Set(await entityIdsForGoal(supabase, goal, "opportunity"));
    opportunities = opportunities.filter((o) => ids.has(o.id));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <FindOpportunitiesBar />
      <ManualOpportunityForm />

      {opportunities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Compass className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No opportunities yet</h2>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="px-1 text-xs text-muted">
            {opportunities.length} {opportunities.length === 1 ? "opportunity" : "opportunities"}
          </p>
          {opportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} showActions={false} />
          ))}
        </div>
      )}
    </div>
  );
}
