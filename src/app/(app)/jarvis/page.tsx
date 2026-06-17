import { JarvisConsole } from "@/components/JarvisConsole";

export const dynamic = "force-dynamic";

export default function JarvisPage() {
  return (
    <div className="flex min-h-[72vh] flex-col items-center justify-center py-4">
      <JarvisConsole />
    </div>
  );
}
