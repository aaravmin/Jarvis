import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** Optional action (e.g. an "Add" button) — no explanatory copy. */
  action?: ReactNode;
};

/** Minimal placeholder for a section with no data: an icon, a short title, and an optional action. */
export function EmptyState({ icon: Icon, title, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-5 inline-flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-2xl bg-accent/10 blur-md" aria-hidden />
        <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border-strong bg-surface-2">
          <Icon className="h-7 w-7 text-accent" strokeWidth={1.75} />
        </span>
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
