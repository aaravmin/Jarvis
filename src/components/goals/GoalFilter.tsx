"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Target, ChevronDown, Check } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function select(goalId: string | null) {
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (goalId) sp.set("goal", goalId);
    else sp.delete("goal");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  }

  if (goals.length === 0) return null; // nothing to filter by yet

  const activeGoal = goals.find((g) => g.id === active);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
          activeGoal ? "border-accent/50 bg-accent-soft/40 text-foreground" : "border-border bg-surface-2 text-muted hover:text-foreground",
        ].join(" ")}
        title="Filter by goal"
      >
        <Target className="h-4 w-4 text-accent" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{activeGoal ? activeGoal.title : "All goals"}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl">
          <button
            type="button"
            onClick={() => select(null)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-surface-2"
          >
            All goals {!activeGoal && <Check className="h-4 w-4 text-accent" />}
          </button>
          <div className="max-h-72 overflow-y-auto border-t border-border">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => select(g.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-muted-strong hover:bg-surface-2 hover:text-foreground"
              >
                <span className="truncate">{g.title}</span>
                {active === g.id && <Check className="h-4 w-4 shrink-0 text-accent" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
