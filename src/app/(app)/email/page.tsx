import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/google/store";
import { formatWhen } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/google/SyncButton";

export const dynamic = "force-dynamic";

type EmailRow = {
  id: string;
  title: string | null;
  from_name: string | null;
  from_email: string | null;
  group_label: string | null;
  permalink: string | null;
  occurred_at: string | null;
  raw_text: string | null;
};

export default async function EmailPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const connection = user ? await getConnection(supabase, user.id) : null;

  const { data } = await supabase
    .from("sources")
    .select("id, title, from_name, from_email, group_label, permalink, occurred_at, raw_text")
    .eq("source_type", "email")
    .order("occurred_at", { ascending: false })
    .limit(150);
  const emails = (data ?? []) as EmailRow[];

  // Group by sender/org; order groups by most-recent email.
  const groups = new Map<string, EmailRow[]>();
  for (const e of emails) {
    const g = e.group_label ?? "Other";
    const arr = groups.get(g) ?? [];
    arr.push(e);
    groups.set(g, arr);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => new Date(b[1][0]?.occurred_at ?? 0).getTime() - new Date(a[1][0]?.occurred_at ?? 0).getTime(),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">Email</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {emails.length > 0 ? `${emails.length} important` : "Only what matters"}
          </p>
        </div>
        {connection ? (
          <SyncButton endpoint="/api/google/sync-email" label="Sync Gmail" />
        ) : (
          <Button asChild size="sm">
            <Link href="/connections">Connect Google</Link>
          </Button>
        )}
      </header>

      {emails.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="text-sm font-semibold text-foreground">No emails yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Sync Gmail and Otto keeps only what matters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ordered.map(([group, rows]) => (
            <section key={group} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group}</h2>
                <span className="text-[11px] text-muted-foreground">{rows.length}</span>
              </div>
              <ul className="divide-y overflow-hidden rounded-md border bg-card">
                {rows.map((e) => (
                  <li key={e.id}>
                    <a
                      href={e.permalink ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-secondary/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{e.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {e.from_name}
                          {e.raw_text ? `, ${e.raw_text}` : ""}
                        </p>
                      </div>
                      {e.occurred_at && <span className="shrink-0 text-[11px] text-muted-foreground">{formatWhen(e.occurred_at)}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
