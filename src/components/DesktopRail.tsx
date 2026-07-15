"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "@/components/Brand";

/**
 * The persistent left rail on desktop (md and up), so the daily Today <-> Review loop is one click.
 * Notion-style: a tight text list (no per-item icons, no descriptions), a search affordance that opens
 * the Cmd-K palette, and a wide content column beside it. Below md the NavDrawer hamburger takes over.
 */
export function DesktopRail({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-secondary/40 px-2.5 py-3 md:flex">
      <div className="flex items-center justify-between px-1.5 pb-3">
        <Link href="/today" aria-label="GOTT home">
          <Brand />
        </Link>
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("gott:command"))}
        className="mb-3 flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-3.5" />
        <span>Search</span>
        <kbd className="ml-auto rounded border bg-secondary px-1 text-[10px] font-medium text-muted-foreground">⌘K</kbd>
      </button>

      <nav className="flex-1 overflow-y-auto">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "block rounded-md px-2 py-1 text-sm transition-colors",
                    active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {userEmail && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t px-1.5 pt-2">
          <p className="min-w-0 truncate text-[11px] text-muted-foreground" title={userEmail}>
            {userEmail}
          </p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-3.5" />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
