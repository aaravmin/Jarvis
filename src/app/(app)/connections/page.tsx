import { createClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/google/store";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const connection = user ? await getConnection(supabase, user.id) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <ConnectionsPanel connection={connection} status={sp.google} />
    </div>
  );
}
