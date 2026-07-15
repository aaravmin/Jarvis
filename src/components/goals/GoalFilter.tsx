"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type G = { id: string; title: string };

/**
 * The global goal anchor selector (Topbar). Picking a goal sets ?goal=<id> in the URL; entity tabs
 * (People, Opportunities, …) read it and filter to that goal's linked items. "All goals" clears it.
 */
export function GoalFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("goal");
  const [goals, setGoals] = useState<G[]>([]);

  useEffect(() => {
    let on = true;
    fetch("/api/goals")
      .then((r) => (r.ok ? r.json() : { goals: [] }))
      .then((d) => on && setGoals((d.goals ?? []) as G[]))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  function select(goalId: string | null) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (goalId) sp.set("goal", goalId);
    else sp.delete("goal");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (goals.length === 0) return null; // nothing to filter by yet

  const activeGoal = goals.find((g) => g.id === active);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Filter by goal"
          className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
            activeGoal
              ? "border-primary/40 bg-secondary text-foreground"
              : "bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="max-w-[10rem] truncate">{activeGoal ? activeGoal.title : "All goals"}</span>
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => select(null)} className="justify-between">
          All goals {!activeGoal && <Check className="size-3.5" />}
        </DropdownMenuItem>
        {goals.map((g) => (
          <DropdownMenuItem key={g.id} onSelect={() => select(g.id)} className="justify-between gap-2">
            <span className="truncate">{g.title}</span>
            {active === g.id && <Check className="size-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
