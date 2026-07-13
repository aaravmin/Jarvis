import { Target } from "lucide-react";

/** A small pill naming a goal an item serves. Shared by the Today feed and the Review queue. */
export function GoalChip({ title }: { title: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-strong">
      <Target className="h-3 w-3" strokeWidth={2} />
      {title}
    </span>
  );
}
