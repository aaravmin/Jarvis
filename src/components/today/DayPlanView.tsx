"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CheckSquare, Mail, RefreshCw, Sparkles, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/Card";
import type { DayPlan, PlanBlock, PlanPriority } from "@/lib/agents/today/plan";

const KIND_ICON: Record<PlanBlock["kind"], LucideIcon> = {
  event: CalendarDays,
  task: CheckSquare,
  email: Mail,
};

const PRIORITY_DOT: Record<PlanPriority, string> = {
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-muted",
};

const PRIORITY_LABEL: Record<PlanPriority, string> = { high: "High", medium: "Medium", low: "Low" };

export function DayPlanView() {
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/today/plan", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) setError(data?.error ?? "Couldn't build your plan.");
      else setPlan(data as DayPlan);
    } catch {
      setError("Network error building your plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <Sparkles className="h-6 w-6 animate-pulse text-accent" />
        <p className="text-sm text-muted">Reading your calendar, tasks, and inbox to plan your day…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        <RefreshButton onClick={load} />
      </div>
    );
  }

  if (!plan || plan.blocks.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border-strong bg-surface-2">
          <Sun className="h-6 w-6 text-accent" strokeWidth={1.75} />
        </span>
        <h2 className="text-base font-semibold text-foreground">Nothing scheduled for today</h2>
        <p className="max-w-sm text-sm text-muted">
          No calendar events, open tasks, or recent emails to plan around. Connect Google and sync, or add a task to
          get a plan.
        </p>
        <RefreshButton onClick={load} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-accent">
            <Sun className="h-3.5 w-3.5" /> {plan.date}
          </p>
          <h1 className="mt-1 text-lg font-semibold text-foreground">Your plan for today</h1>
          {plan.summary && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-strong">{plan.summary}</p>}
        </div>
        <RefreshButton onClick={load} compact />
      </header>

      <ol className="space-y-3">
        {plan.blocks.map((b, i) => {
          const Icon = KIND_ICON[b.kind];
          return (
            <li key={`${b.ref}-${i}`} className="flex gap-3">
              {/* Time rail */}
              <div className="w-16 shrink-0 pt-3 text-right">
                <span className={`text-xs font-medium ${b.fixed ? "text-foreground" : "text-muted"}`}>{b.timeLabel}</span>
              </div>
              {/* Block */}
              <div className="min-w-0 flex-1">
                <Card
                  title={b.action}
                  source={b.source}
                  reasoning={b.why}
                  meta={
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${b.fixed ? "border border-accent/40 bg-accent-soft/40 text-foreground" : "text-muted"}`}
                      >
                        <Icon className="h-3 w-3" strokeWidth={2} />
                        {b.fixed ? "Scheduled" : b.kind === "email" ? "Email" : "Task"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" title={`${PRIORITY_LABEL[b.priority]} priority`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[b.priority]}`} />
                        {PRIORITY_LABEL[b.priority]}
                      </span>
                    </span>
                  }
                />
              </div>
            </li>
          );
        })}
      </ol>

      <p className="pt-1 text-center text-xs text-muted">
        Jarvis ordered these — it never invents times. Fixed events keep their real calendar time; tasks are sequenced
        around them.
      </p>
    </div>
  );
}

function RefreshButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 text-sm text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {compact ? "Replan" : "Try again"}
    </button>
  );
}
