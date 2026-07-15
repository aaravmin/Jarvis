"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { NavDrawer } from "@/components/NavDrawer";
import { GoalFilter } from "@/components/goals/GoalFilter";

/**
 * A minimal top control strip. Below md the hamburger <NavDrawer> plus a search affordance (opens the
 * Cmd-K palette, since touch has no keyboard shortcut) are the nav surface; at md+ the persistent
 * <DesktopRail> takes over and both hide. The goal filter renders only on /tasks, the one page that
 * reads ?goal=.
 */
export function Topbar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const showGoalFilter = pathname === "/tasks";
  return (
    <div className="flex items-center gap-2 px-5 pt-4 md:px-6 md:pt-5">
      <span className="md:hidden">
        <NavDrawer userEmail={userEmail} />
      </span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("otto:command"))}
        aria-label="Search"
        className="inline-flex size-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground md:hidden"
      >
        <Search className="size-4" />
      </button>
      <div className="flex-1" />
      {showGoalFilter && (
        <Suspense fallback={null}>
          <GoalFilter />
        </Suspense>
      )}
    </div>
  );
}
