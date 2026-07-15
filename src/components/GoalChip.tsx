/** A small neutral pill naming a goal an item serves. Shared by the Today feed and the Review queue.
 *  No icon: goal linkage is not a status, so it stays quiet ink on a faint fill. */
export function GoalChip({ title }: { title: string }) {
  return (
    <span className="inline-flex max-w-[14rem] items-center truncate rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-strong">
      {title}
    </span>
  );
}
