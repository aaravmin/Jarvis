import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadAcceptedPeople } from "@/lib/research/load";
import { entityIdsForGoal } from "@/lib/goals/load";
import { PersonCard } from "@/components/PersonCard";
import { FindPeopleBar } from "@/components/FindPeopleBar";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const supabase = await createClient();
  let people = await loadAcceptedPeople(supabase);
  if (goal) {
    const ids = new Set(await entityIdsForGoal(supabase, goal, "contact"));
    people = people.filter((p) => ids.has(p.id));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <FindPeopleBar />

      {people.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Users className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No people yet</h2>
        </div>
      ) : (
        <div className="space-y-3">
          {people.map((p) => (
            <PersonCard key={p.id} person={p} showActions={false} />
          ))}
        </div>
      )}
    </div>
  );
}
