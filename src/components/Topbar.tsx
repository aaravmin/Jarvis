"use client";

import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";
import { activeNavItem } from "@/lib/nav";

export function Topbar() {
  const pathname = usePathname();
  const item = activeNavItem(pathname);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/70 px-5 backdrop-blur md:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
          {item?.label ?? "Jarvis"}
        </h1>
        {item?.description && (
          <p className="truncate text-xs text-muted">{item.description}</p>
        )}
      </div>

      {/* Voice orb — placeholder until Phase 8. Disabled, but present so the layout is final. */}
      <button
        type="button"
        disabled
        title="Voice control arrives in Phase 8"
        aria-label="Ask Jarvis (coming in Phase 8)"
        className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-3 py-1.5 text-sm text-muted opacity-70 cursor-not-allowed"
      >
        <span className="relative inline-flex h-4 w-4 items-center justify-center">
          <Mic className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="hidden sm:inline">Ask Jarvis</span>
      </button>
    </header>
  );
}
