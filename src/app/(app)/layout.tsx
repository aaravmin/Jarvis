import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { Topbar } from "@/components/Topbar";

/**
 * The dashboard shell: persistent sidebar (md+) or mobile tab strip, a sticky top bar,
 * and the scrollable content area where each section renders.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-ambient flex min-h-dvh flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <Topbar />
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
