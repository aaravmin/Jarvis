import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function CalendarPage() {
  return <EmptyState icon={CalendarDays} title="No events yet" />;
}
