import { CheckSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { entityIdsForGoal } from "@/lib/goals/load";
import { formatDate } from "@/lib/format";
import { ManualTaskForm } from "@/components/manual/ManualTaskForm";

export const dynamic = "force-dynamic";

type TaskRow = { id: string; title: string; due_at: string | null; reasoning: string | null; status: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const { goal } = await searchParams;
  const supabase = await createClient();

  let q = supabase
    .from("items")
    .select("id, title, due_at, reasoning, status")
    .eq("item_type", "task")
    .in("status", ["accepted", "done"])
    .order("due_at", { ascending: true, nullsFirst: false });
  if (goal) {
    const ids = await entityIdsForGoal(supabase, goal, "item");
    q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }
  const { data } = await q;
  const tasks = (data ?? []) as TaskRow[];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ManualTaskForm />

      {tasks.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <CheckSquare className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No tasks yet</h2>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className={`truncate text-sm ${t.status === "done" ? "text-muted line-through" : "text-foreground"}`}>{t.title}</p>
                {t.reasoning && <p className="truncate text-xs text-muted">{t.reasoning}</p>}
              </div>
              {t.due_at && <span className="shrink-0 text-xs text-muted">{formatDate(t.due_at)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
