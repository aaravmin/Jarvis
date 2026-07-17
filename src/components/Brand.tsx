/** The Otto wordmark: just the name, in a homey rounded display face (Baloo 2, loaded as --font-otto
 *  in the root layout). Wordmark only, no logo mark. Body text elsewhere stays the clean sans. */
export function Brand({ withWordmark = true }: { withWordmark?: boolean }) {
  if (!withWordmark) return null;
  return (
    <span className="font-[family-name:var(--font-otto)] text-[17px] font-semibold leading-none tracking-tight text-foreground">
      Otto
    </span>
  );
}
