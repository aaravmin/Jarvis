"use client";

import { usePathname } from "next/navigation";

/**
 * Route-aware app background. The home/orb screen (/jarvis) is intentionally a pure-black canvas —
 * "all you see is the circle and the time". Every other page keeps the subtle "command center"
 * ambient glow. A tiny client boundary so the server layout can stay an auth gate.
 */
export function AppBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/jarvis";
  return (
    <div className={[isHome ? "bg-black" : "app-ambient", "flex min-h-dvh flex-col"].join(" ")}>
      {children}
    </div>
  );
}
