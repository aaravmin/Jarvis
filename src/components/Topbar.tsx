"use client";

import { Suspense, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { AskJarvisDialog } from "@/components/AskJarvisDialog";
import { NavDrawer } from "@/components/NavDrawer";
import { GoalFilter } from "@/components/goals/GoalFilter";

/**
 * A minimal top control strip — no page title (the sidebar already brands the app). Just the mobile
 * nav hamburger on the left and the goal filter + "Ask Jarvis" pushed all the way to the right.
 */
export function Topbar({ userEmail }: { userEmail?: string }) {
  const [askOpen, setAskOpen] = useState(false);

  // Cmd/Ctrl+K opens the "Ask Jarvis" command surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex items-center gap-3 px-5 pt-5 md:px-8">
      <NavDrawer userEmail={userEmail} />
      <div className="flex-1" />

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
    </div>
  );
}
