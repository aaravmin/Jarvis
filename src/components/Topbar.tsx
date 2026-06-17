"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { activeNavItem } from "@/lib/nav";
import { AskJarvisDialog } from "@/components/AskJarvisDialog";
import { NavDrawer } from "@/components/NavDrawer";

export function Topbar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const item = activeNavItem(pathname);
  const [askOpen, setAskOpen] = useState(false);

  // Cmd/Ctrl+K opens the "Ask Jarvis to find…" command surface.
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
    <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-background/70 px-4 backdrop-blur md:px-6">
      <NavDrawer userEmail={userEmail} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
          {item?.label ?? "Jarvis"}
        </h1>
        {item?.description && (
          <p className="truncate text-xs text-muted">{item.description}</p>
        )}
      </div>

      {/* Ask Jarvis — auto-populate command surface. Text now; the same handler takes voice in Phase 8. */}
      <button
        type="button"
        onClick={() => setAskOpen(true)}
        title="Ask Jarvis to find people (⌘K)"
        aria-label="Ask Jarvis to find people"
        className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-3 py-1.5 text-sm text-muted-strong transition-colors hover:border-accent/50 hover:text-foreground"
      >
        <Search className="h-4 w-4 text-accent" strokeWidth={2} />
        <span className="hidden sm:inline">Ask Jarvis</span>
        <kbd className="hidden rounded border border-border bg-surface px-1.5 text-[10px] text-muted md:inline">
          ⌘K
        </kbd>
      </button>

      <AskJarvisDialog open={askOpen} onClose={() => setAskOpen(false)} />
    </header>
  );
}
