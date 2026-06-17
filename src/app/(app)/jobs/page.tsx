import { Briefcase } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function JobsPage() {
  return (
    <EmptyState
      icon={Briefcase}
      title="No applications yet"
      description="A Kanban board — Wishlist → Applied → Interview → Offer — that tracks itself. Jarvis detects application emails, proposes status changes with the quote that justifies them, and links recruiters to your People list."
      deliveredBy="Phase 7"
    />
  );
}
