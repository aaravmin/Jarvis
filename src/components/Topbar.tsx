"use client";

import { Suspense } from "react";
import { NavDrawer } from "@/components/NavDrawer";
import { GoalFilter } from "@/components/goals/GoalFilter";

/**
 * A minimal top control strip. The left hamburger <NavDrawer> is the only nav surface and shows on
 * every page. The goal filter sits on the right.
 */
export function Topbar({ userEmail }: { userEmail?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 md:px-8">
      <NavDrawer userEmail={userEmail} />
      <div className="flex-1" />
      <Suspense fallback={null}>
        <GoalFilter />
      </Suspense>
    </div>
  );
}
