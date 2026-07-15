import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBackground } from "@/components/AppBackground";
import { DesktopRail } from "@/components/DesktopRail";
import { Topbar } from "@/components/Topbar";
import { CommandPalette } from "@/components/CommandPalette";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

/**
 * The dashboard shell. Desktop (md+) shows a tight Notion-style left rail so the daily Today <-> Review
 * loop is one click; below md navigation lives behind the Topbar's hamburger <NavDrawer>. A Cmd-K
 * palette is mounted for quick nav from anywhere.
 *
 * This layout is the server-side auth gate (defense-in-depth behind the middleware):
 * no session -> straight to /login. Everything below it can assume a signed-in user.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <TooltipProvider delayDuration={200}>
      <AppBackground>
        <div className="flex min-h-dvh">
          <DesktopRail userEmail={user.email ?? undefined} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar userEmail={user.email ?? undefined} />
            <main className="flex-1 px-5 pb-12 pt-4 md:px-6">{children}</main>
          </div>
        </div>
      </AppBackground>
      <CommandPalette />
      <Toaster />
    </TooltipProvider>
  );
}
