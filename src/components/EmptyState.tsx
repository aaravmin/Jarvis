import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Roadmap phase/task that fills this section, shown as a small badge. */
  deliveredBy?: string;
};

/**
 * Consistent placeholder for a section that has no data yet.
 * Every section in the Phase 0 shell renders one of these so the app feels complete.
 */
export function EmptyState({ icon: Icon, title, description, deliveredBy }: EmptyStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-5 inline-flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-2xl bg-accent/10 blur-md" aria-hidden />
        <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-2xl border border-border-strong bg-surface-2">
          <Icon className="h-7 w-7 text-accent" strokeWidth={1.75} />
        </span>
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {deliveredBy && (
        <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted-strong">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Delivered by {deliveredBy}
        </span>
      )}
    </div>
  );
}
