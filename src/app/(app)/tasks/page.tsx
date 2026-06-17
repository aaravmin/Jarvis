import { CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function TasksPage() {
  return (
    <EmptyState
      icon={CheckSquare}
      title="No tasks yet"
      description="Tasks you create by hand — and, later, commitments Jarvis extracts from your email and meetings — live here. Every task carries a link back to the exact line that created it."
      deliveredBy="Phase 1 · P1-T1"
    />
  );
}
