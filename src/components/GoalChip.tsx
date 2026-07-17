import { PILL } from "@/lib/ui";
import { cn } from "@/lib/utils";

/** A muted pill naming a goal an item serves. Shares the one standard PILL style; a tiny target dot
 *  marks it as a goal without introducing a loud color. Shared by the Today feed and the Review queue. */
export function GoalChip({ title }: { title: string }) {
  return (
    <span className={cn(PILL, "max-w-[12rem]")}>
      <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
      <span className="min-w-0 truncate">{title}</span>
    </span>
  );
}
