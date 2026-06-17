"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "@/components/Brand";

export function Sidebar() {
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
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-warning" />
          <div className="leading-tight">
            <p className="text-xs font-medium text-foreground">Phase 0 · Foundations</p>
            <p className="text-[11px] text-muted">No data sources connected yet</p>
          </div>
        </div>
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
