import { CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function TasksPage() {
  return <EmptyState icon={CheckSquare} title="No tasks yet" />;
}
