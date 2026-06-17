import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function CalendarPage() {
  return (
    <EmptyState
      icon={CalendarDays}
      title="No calendar connected"
      description={'Your events will appear here once Calendar is connected. "Let\'s meet Sunday" in an email becomes a proposed event you approve — with the date resolved correctly, never guessed.'}
      deliveredBy="Phase 3"
    />
  );
}
