"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "@/components/Brand";

export function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col border-r border-border bg-surface/80 backdrop-blur">
      <div className="flex h-16 items-center px-5 border-b border-border">
        <Brand />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
          Command center
        </p>
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-surface-3 text-foreground"
                      : "text-muted hover:bg-surface-2 hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon
                    className={[
                      "h-[18px] w-[18px] shrink-0 transition-colors",
                      active ? "text-accent" : "text-muted group-hover:text-foreground",
                    ].join(" ")}
                    strokeWidth={2}
                  />
                  <span className="font-medium">{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_1px_var(--color-accent)]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {userEmail && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-medium text-foreground" title={userEmail}>
                {userEmail}
              </p>
              <p className="text-[11px] text-muted">Phase 0 · Foundations</p>
            </div>
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
        <Link
          href="/dev"
          className="block px-3 text-[11px] text-muted transition-colors hover:text-accent"
        >
          Component lab →
        </Link>
      </div>
    </aside>
  );
}
