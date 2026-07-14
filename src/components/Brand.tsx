/** The GOTT "orb" mark, a cyan arc-reactor circle. Used in the sidebar and on small screens. */
export function Brand({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex h-8 w-8 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-accent/20 blur-[6px]" aria-hidden />
        <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-gradient-to-br from-accent/30 to-accent-strong/10">
          <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_2px_var(--color-accent)]" />
        </span>
      </span>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          GOTT
        </span>
      )}
    </div>
  );
}
