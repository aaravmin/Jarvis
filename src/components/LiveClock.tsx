"use client";

import { useEffect, useState } from "react";

/**
 * A live clock + date for the Jarvis home, styled to the reference: military time with no seconds
 * ("23:04") and an uppercase, letter-spaced date below ("SUNDAY 26 APRIL").
 *
 * Hydration-safe: the first render shows a stable placeholder (no `Date` on the server), then we
 * start ticking after mount so server/client markup matches. `tabular-nums` keeps digits from jittering.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Military time, no seconds (e.g. "23:04").
  const time = now
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : "--:--";
  // "SUNDAY 26 APRIL", uppercase weekday + day + month, no year.
  const date = now
    ? `${now.toLocaleDateString(undefined, { weekday: "long" })} ${now.getDate()} ${now.toLocaleDateString(undefined, { month: "long" })}`.toUpperCase()
    : "";

  return (
    <div className="select-none text-center">
      <div
        className="text-6xl font-light tabular-nums tracking-[0.08em] text-foreground sm:text-7xl"
        style={{ textShadow: "0 0 28px rgba(34,197,94,0.30)" }}
        suppressHydrationWarning
      >
        {time}
      </div>
      <div className="mt-2 text-xs font-medium tracking-[0.35em] text-muted" suppressHydrationWarning>
        {date || " "}
      </div>
    </div>
  );
}
