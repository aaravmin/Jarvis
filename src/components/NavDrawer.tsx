"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { Brand } from "@/components/Brand";

/**
 * The slide-in navigation drawer + its hamburger trigger, the nav surface BELOW md (at md+ the
 * persistent <DesktopRail> replaces it and the hamburger is hidden by the Topbar). Closes on Escape,
 * overlay click, and route change; locks body scroll while open.
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
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        <Menu className="size-[18px]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="drawer-overlay absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />

          <aside className="drawer-panel absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r bg-secondary/40 shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <Link href="/today" aria-label="GOTT home">
                <Brand />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2.5 py-3">
              <ul className="space-y-0.5">
                {NAV_ITEMS.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "block rounded-md px-2 py-1.5 text-sm transition-colors",
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
              <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
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
                    <LogOut className="size-4" />
                  </button>
                </form>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
