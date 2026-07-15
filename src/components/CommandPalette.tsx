"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/lib/nav";

/**
 * The Cmd-K quick-nav palette (Notion/Linear feel). Opens on Cmd/Ctrl+K, or when any surface fires the
 * `gott:command` window event (the rail and mobile top bar have a search affordance that dispatches it,
 * so no shared state or context is needed). Selecting an entry navigates and closes.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("gott:command", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("gott:command", onOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Jump to a section">
      <CommandInput placeholder="Go to..." />
      <CommandList>
        <CommandEmpty>No match.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <Icon className="text-muted-foreground" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
