/** The Otto wordmark: just the name, calm and flat. No logo mark. */
export function Brand({ withWordmark = true }: { withWordmark?: boolean }) {
  if (!withWordmark) return null;
  return <span className="text-sm font-semibold tracking-tight text-foreground">Otto</span>;
}
