"use client";

import { usePathname } from "next/navigation";

/**
 * Route-aware app background. The home/orb screen (/jarvis) is a deep green hero canvas so the
 * glowing orb still reads (the orb uses screen blending, which needs a dark backdrop). Every other
 * page is the light canvas with a subtle green wash. A tiny client boundary so the server layout can
 * stay an auth gate.
 */
export function AppBackground({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/jarvis";
  return (
    <div className={[isHome ? "home-canvas" : "app-ambient", "flex min-h-dvh flex-col"].join(" ")}>
      {children}
    </div>
  );
}
