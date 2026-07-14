"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "@/components/Brand";

/**
 * The persistent left rail on desktop (md and up), so the daily Today <-> Review loop is one click.
 * Below md the NavDrawer hamburger remains the only nav surface; at md+ the hamburger is hidden and
 * this rail replaces it (one nav entry point per breakpoint).
 */
export function DesktopRail({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-border bg-surface px-3 py-5 md:flex">
      <Link href="/today" aria-label="GOTT home" className="px-3 pb-5">
        <Brand />
      </Link>
      <nav className="flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.description}
                  className={[
                    "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-surface-3 font-medium text-foreground" : "text-muted hover:bg-surface-3 hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon
                    className={["h-[17px] w-[17px] shrink-0", active ? "text-accent" : "text-muted group-hover:text-foreground"].join(" ")}
                    strokeWidth={2}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {userEmail && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3 pt-3">
          <p className="min-w-0 truncate text-xs text-muted" title={userEmail}>
            {userEmail}
          </p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}
