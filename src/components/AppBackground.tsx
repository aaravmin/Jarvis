/**
 * The app background: a light canvas with a subtle wash. Pure presentation so the server layout can
 * stay an auth gate.
 */
export function AppBackground({ children }: { children: React.ReactNode }) {
  return <div className="app-ambient flex min-h-dvh flex-col">{children}</div>;
}
