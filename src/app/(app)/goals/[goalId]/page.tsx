import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadGoalDetail } from "@/lib/goals/load";
import { GoalDetailView } from "@/components/goals/GoalDetailView";

export const dynamic = "force-dynamic";

export default async function GoalDetailPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const supabase = await createClient();
  const detail = await loadGoalDetail(supabase, goalId);
  if (!detail) notFound();
  return <GoalDetailView detail={detail} />;
}
