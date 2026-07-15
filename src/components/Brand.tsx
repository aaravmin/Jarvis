/** The GOTT wordmark: a small solid ink mark + the name. Calm and flat, no glow. */
export function Brand({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
        G
      </span>
      {withWordmark && (
        <span className="text-sm font-semibold tracking-tight text-foreground">GOTT</span>
      )}
    </div>
  );
}
