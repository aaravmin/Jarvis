"use client";

import { useEffect, useState } from "react";

/**
 * A live ticking clock + date for the Jarvis home. Hydration-safe: the first render shows a stable
 * placeholder (no `Date` on the server), then we start ticking after mount so server/client markup
 * matches. `tabular-nums` keeps the digits from jittering as they change.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
  const date = now
    ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="select-none text-center">
      <div
        className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-foreground sm:text-6xl"
        style={{ textShadow: "0 0 24px rgba(56,189,248,0.25)" }}
        suppressHydrationWarning
      >
        {time}
      </div>
      <div className="mt-1 text-sm text-muted" suppressHydrationWarning>
        {date || " "}
      </div>
    </div>
  );
}
