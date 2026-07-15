import { createClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/google/store";
import { getNotionConnection } from "@/lib/notion/store";
import { notionOAuthConfigured } from "@/lib/notion/oauth";
import { ConnectionsPanel } from "@/components/ConnectionsPanel";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; notion?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [connection, notion] = await Promise.all([
    user ? getConnection(supabase, user.id) : null,
    user ? getNotionConnection(supabase, user.id) : null,
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <ConnectionsPanel
        connection={connection}
        status={sp.google}
        notion={{
          connected: !!notion,
          workspaceName: notion?.workspaceName,
          canConnect: notionOAuthConfigured(),
          envFallback: !notion && !!process.env.NOTION_API_KEY,
          status: sp.notion,
        }}
      />
    </div>
  );
}
