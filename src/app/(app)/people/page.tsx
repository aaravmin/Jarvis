import { createClient } from "@/lib/supabase/server";
import { loadAcceptedPeople } from "@/lib/research/load";
import { entityIdsForGoal } from "@/lib/goals/load";
import { FindPeopleBar } from "@/components/FindPeopleBar";
import { ApolloFinder } from "@/components/ApolloFinder";
import { ManualContactForm } from "@/components/manual/ManualContactForm";
import { AddFromLinkedIn } from "@/components/contacts/AddFromLinkedIn";
import { ContactsWorkspace } from "@/components/contacts/ContactsWorkspace";
import { apolloEnabled } from "@/lib/apollo";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const supabase = await createClient();
  const apolloOn = apolloEnabled();
  let people = await loadAcceptedPeople(supabase);
  if (goal) {
    const ids = new Set(await entityIdsForGoal(supabase, goal, "contact"));
    people = people.filter((p) => ids.has(p.id));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <FindPeopleBar />
      <AddFromLinkedIn apolloEnabled={apolloOn} />
      <div className="flex flex-wrap items-center gap-2">
        <ManualContactForm apolloEnabled={apolloOn} />
        {apolloOn && <ApolloFinder />}
      </div>
      <ContactsWorkspace people={people} apolloEnabled={apolloOn} />
    </div>
  );
}
