import { DayPlanView } from "@/components/today/DayPlanView";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <DayPlanView />
    </div>
  );
}
