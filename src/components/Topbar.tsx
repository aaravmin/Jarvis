"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { AskJarvisDialog } from "@/components/AskJarvisDialog";
import { NavDrawer } from "@/components/NavDrawer";
import { GoalFilter } from "@/components/goals/GoalFilter";

/**
 * A minimal top control strip. The left hamburger <NavDrawer> is the only nav surface and shows on
 * every page. The goal filter + "Ask Jarvis" command button sit on the right — but NOT on the home
 * orb screen (/jarvis), which is kept deliberately bare (just the orb, the clock, and its own ask
 * box). Ask Jarvis already lives below the clock there, so a second one up top would be redundant.
 */
export function Topbar({ userEmail }: { userEmail?: string }) {
  const [askOpen, setAskOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/jarvis";

  // Cmd/Ctrl+K opens the "Ask Jarvis" command surface (everywhere except the bare home screen, which
  // has its own ask box right under the clock).
  useEffect(() => {
    if (isHome) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isHome]);

  return (
    <div className="flex items-center gap-3 px-5 pt-5 md:px-8">
      <NavDrawer userEmail={userEmail} />
      <div className="flex-1" />

      {!isHome && (
        <>
          <Suspense fallback={null}>
            <GoalFilter />
          </Suspense>

          <button
            type="button"
            onClick={() => setAskOpen(true)}
            title="Ask Jarvis (⌘K)"
            aria-label="Ask Jarvis"
            className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-3 py-1.5 text-sm text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
          >
            <Search className="h-4 w-4 text-accent" strokeWidth={2} />
            <span className="hidden sm:inline">Ask Jarvis</span>
            <kbd className="hidden rounded border border-border bg-surface px-1.5 text-[10px] text-muted md:inline">⌘K</kbd>
          </button>

          <AskJarvisDialog open={askOpen} onClose={() => setAskOpen(false)} />
        </>
      )}
    </div>
  );
}
