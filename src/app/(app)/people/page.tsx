import { Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function PeoplePage() {
  return (
    <EmptyState
      icon={Users}
      title="No people yet"
      description="Track who you owe a follow-up: their info auto-researched from the web, why they matter to your goals, what you need from them, and how you know them — with AI-drafted, personalized outreach you approve before sending."
      deliveredBy="Phase 6"
    />
  );
}
