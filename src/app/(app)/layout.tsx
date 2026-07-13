import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppBackground } from "@/components/AppBackground";
import { Topbar } from "@/components/Topbar";

/**
 * The dashboard shell: a content column (a Topbar + scrollable main). Navigation lives entirely
 * behind the Topbar's left hamburger <NavDrawer>, there's no always-on rail, so opening Jarvis
 * shows just the page content until you toggle the menu.
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
      <Topbar userEmail={user.email ?? undefined} />
      <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
    </AppBackground>
  );
}
