import { createClient } from "@/lib/supabase/server";
import { loadGoals } from "@/lib/goals/load";
import { GoalsManager } from "@/components/goals/GoalsManager";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await createClient();
  const goals = await loadGoals(supabase);
  return <GoalsManager initialGoals={goals} />;
}
