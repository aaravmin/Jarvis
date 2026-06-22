import { createClient } from "@/lib/supabase/server";
import { loadAcceptedOpportunities } from "@/lib/agents/opportunity/load";
import { entityIdsForGoal } from "@/lib/goals/load";
import { FindOpportunitiesBar } from "@/components/FindOpportunitiesBar";
import { ManualOpportunityForm } from "@/components/manual/ManualOpportunityForm";
import { OpportunitiesWorkspace } from "@/components/opportunities/OpportunitiesWorkspace";

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
    <div className="mx-auto max-w-6xl space-y-4">
      <FindOpportunitiesBar />
      <ManualOpportunityForm />
      <OpportunitiesWorkspace opportunities={opportunities} />
    </div>
  );
}
