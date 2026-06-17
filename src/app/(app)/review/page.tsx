import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function ReviewPage() {
  return (
    <EmptyState
      icon={Inbox}
      title="Nothing to review"
      description="This is where suggestions wait for your approval before becoming real items — the heart of Jarvis's 'suggest first, automate later' design. Each card shows its source, the exact quote, a confidence score, and the resolved date."
      deliveredBy="Phase 1 · P1-T4 (filled in Phase 2)"
    />
  );
}
