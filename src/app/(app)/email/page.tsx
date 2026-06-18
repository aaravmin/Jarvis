import Link from "next/link";
import { Mail, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/google/store";
import { formatWhen } from "@/lib/format";
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
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        {connection ? (
          <SyncButton endpoint="/api/google/sync-email" label="Sync Gmail" />
        ) : (
          <Link href="/connections" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-[#04181f] hover:bg-accent-strong">
            Connect Google
          </Link>
        )}
        {emails.length > 0 && <span className="text-xs text-muted">{emails.length} important · only what matters</span>}
      </div>

      {emails.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Mail className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No emails yet</h2>
        </div>
      ) : (
        <div className="space-y-4">
          {ordered.map(([group, rows]) => (
            <section key={group}>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {group} <span className="rounded-full bg-surface-2 px-1.5 text-[10px] text-muted-strong">{rows.length}</span>
              </p>
              <div className="space-y-1">
                {rows.map((e) => (
                  <a
                    key={e.id}
                    href={e.permalink ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 transition-colors hover:border-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{e.title}</p>
                      <p className="truncate text-xs text-muted">
                        {e.from_name}
                        {e.raw_text ? ` — ${e.raw_text}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {e.occurred_at && <span className="text-[11px] text-muted">{formatWhen(e.occurred_at)}</span>}
                      <ChevronRight className="h-4 w-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
