import { Mic } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function MeetingsPage() {
  return <EmptyState icon={Mic} title="No meetings yet" />;
}
