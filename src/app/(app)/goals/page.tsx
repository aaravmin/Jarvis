import { Target } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function GoalsPage() {
  return (
    <EmptyState
      icon={Target}
      title="No goals yet"
      description={'Set what you\'re working toward — "work in big tech", "break into tech for social good" — and Jarvis links tasks and people to each goal so you can see progress and why every contact matters.'}
      deliveredBy="Phase 1 · P1-T2"
    />
  );
}
