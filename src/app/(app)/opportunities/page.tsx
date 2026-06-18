import { Compass } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadAcceptedOpportunities } from "@/lib/agents/opportunity/load";
import { OpportunityCard } from "@/components/OpportunityCard";
import { FindOpportunitiesBar } from "@/components/FindOpportunitiesBar";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const supabase = await createClient();
  const opportunities = await loadAcceptedOpportunities(supabase);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <FindOpportunitiesBar />

      {opportunities.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Compass className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No opportunities yet</h2>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} showActions={false} />
          ))}
        </div>
      )}
    </div>
  );
}
