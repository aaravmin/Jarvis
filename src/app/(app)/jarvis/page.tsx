import { JarvisConsole } from "@/components/JarvisConsole";

export const dynamic = "force-dynamic";

/**
 * The Jarvis home — the immersive "command center" screen: a live clock, the arc-reactor orb, the
 * JARVIS wordmark, and the ask console (type or talk). This is where root (`/`) and post-login land.
 */
export default function JarvisPage() {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center py-4">
      <JarvisConsole hero />
    </div>
  );
}
