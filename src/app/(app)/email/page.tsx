import { Mail } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function EmailPage() {
  return (
    <EmptyState
      icon={Mail}
      title="Email agent not connected"
      description="The Email agent reads your Gmail (read-only first) and turns it into sourced tasks, follow-ups, and proposed calendar events — each linked back to the exact message. Connect Gmail via the Google OAuth client (see /docs/CONNECTORS.md) to activate it."
      deliveredBy="Email agent · needs Gmail connected"
    />
  );
}
