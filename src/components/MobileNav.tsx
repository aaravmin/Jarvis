"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "@/components/Brand";

/** Compact navigation for small screens: brand bar + a horizontally scrollable tab strip. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden border-b border-border bg-surface/80 backdrop-blur">
      <div className="flex h-14 items-center px-4">
        <Brand />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-surface-3 text-foreground"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              ].join(" ")}
            >
              <Icon
                className={["h-4 w-4", active ? "text-accent" : ""].join(" ")}
                strokeWidth={2}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
