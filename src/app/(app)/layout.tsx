import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";

/**
 * The dashboard shell: a sticky top bar with the hamburger nav-drawer trigger, over the scrollable
 * content area. Navigation lives in the slide-in <NavDrawer> (opened from the Topbar hamburger) —
 * the persistent sidebar was replaced so the Jarvis home reads as an immersive command center.
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
    <div className="app-ambient flex min-h-dvh flex-col">
      <Topbar userEmail={user.email ?? undefined} />
      <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
