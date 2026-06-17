import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

/**
 * The dashboard shell: a persistent full-height left nav rail (md+) beside the content column (a
 * sticky Topbar + scrollable main). On small screens the rail collapses and the Topbar's hamburger
 * <NavDrawer> takes over. The rail is plain links, so navigation works even if client JS doesn't.
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
    <div className="app-ambient flex min-h-dvh flex-col md:flex-row">
      <Sidebar userEmail={user.email ?? undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar userEmail={user.email ?? undefined} />
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
