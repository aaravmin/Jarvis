"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { NavDrawer } from "@/components/NavDrawer";
import { GoalFilter } from "@/components/goals/GoalFilter";

/**
 * A minimal top control strip. Below md the hamburger <NavDrawer> is the nav surface; at md+ the
 * persistent <DesktopRail> takes over and the hamburger hides. The goal filter renders only on
 * /tasks, the one page that reads ?goal= (an always-visible control that does nothing elsewhere
 * would be worse than none).
 */
export function Topbar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const showGoalFilter = pathname === "/tasks";
  return (
    <div className="flex items-center gap-3 px-5 pt-5 md:px-8">
      <span className="md:hidden">
        <NavDrawer userEmail={userEmail} />
      </span>
      <div className="flex-1" />
      {showGoalFilter && (
        <Suspense fallback={null}>
          <GoalFilter />
        </Suspense>
      )}
    </div>
  );
}
