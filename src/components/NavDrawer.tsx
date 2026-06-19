"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "@/components/Brand";

/**
 * The slide-in navigation drawer + its hamburger trigger — the app's ONLY nav surface. There is no
 * always-on rail: the tab list lives behind a left hamburger and overlays on demand at every screen
 * size, so Jarvis opens to just the orb and the clock. Closes on Escape, overlay click, and route
 * change; locks body scroll while open.
 */
export function NavDrawer({ userEmail }: { userEmail?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change so navigating from inside the drawer dismisses it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:border-accent/50 hover:text-foreground"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-overlay absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <aside className="drawer-panel absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface shadow-2xl">
            <div className="flex h-16 items-center justify-between px-5 border-b border-border">
              <Link href="/jarvis" aria-label="Jarvis home">
                <Brand />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-4">
              <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                Command center
              </p>
              <ul className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                    <p className="text-[11px] text-muted">Signed in</p>
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
              {process.env.NODE_ENV !== "production" && (
                <Link
                  href="/dev"
                  className="block px-3 text-[11px] text-muted transition-colors hover:text-accent"
                >
                  Component lab →
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
