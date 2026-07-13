import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBackground } from "@/components/AppBackground";
import { DesktopRail } from "@/components/DesktopRail";
import { Topbar } from "@/components/Topbar";

/**
 * The dashboard shell. Desktop (md+) shows a persistent left rail so the daily Today <-> Review loop
 * is one click; below md navigation lives behind the Topbar's hamburger <NavDrawer>.
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
    <AppBackground>
      <div className="flex min-h-dvh">
        <DesktopRail userEmail={user.email ?? undefined} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar userEmail={user.email ?? undefined} />
          <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </AppBackground>
  );
}
