import { Home } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function TodayPage() {
  return (
    <EmptyState
      icon={Home}
      title="Your day, in one place"
      description="Today will show today's tasks, today's events, and anything overdue — sorted and sourced. It's the daily home you'll open first. Connect a data source and it fills itself."
      deliveredBy="Phase 1 · P1-T3"
    />
  );
}
