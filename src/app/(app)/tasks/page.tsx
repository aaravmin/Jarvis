import { createClient } from "@/lib/supabase/server";
import { entityIdsForGoal } from "@/lib/goals/load";
import { ManualTaskForm } from "@/components/manual/ManualTaskForm";
import { TaskItem, type Task } from "@/components/tasks/TaskItem";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const HEAD = "h-8 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const supabase = await createClient();

  // One "things on my plate" surface: tasks, follow-ups the user owes, and date-bound events all land
  // here once accepted (events/follow-ups would otherwise vanish after the Review queue). A type tag
  // keeps them distinct; the date column shows whatever chrono resolved.
  let q = supabase
    .from("items")
    .select("id, title, due_at, reasoning, status, item_type")
    .in("item_type", ["task", "event", "follow_up"])
    .in("status", ["accepted", "done"])
    .order("due_at", { ascending: true, nullsFirst: false });
  if (goal) {
    const ids = await entityIdsForGoal(supabase, goal, "item");
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data } = await q;
  const tasks = (data ?? []) as Task[];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <h1 className="text-base font-semibold tracking-tight text-foreground">Tasks</h1>

      <div className="overflow-hidden rounded-md border bg-card">
        <ManualTaskForm />
        {tasks.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted-foreground">No tasks yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${HEAD} w-9`} />
                <TableHead className={HEAD}>Title</TableHead>
                <TableHead className={`${HEAD} w-28`}>Due</TableHead>
                <TableHead className={`${HEAD} w-16 text-right`} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TaskItem key={t.id} task={t} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
