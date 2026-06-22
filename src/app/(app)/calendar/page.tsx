import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/google/store";
import { formatEventTime, calendarLocation } from "@/lib/format";
import { SyncButton } from "@/components/google/SyncButton";

export const dynamic = "force-dynamic";

type EventRow = { id: string; title: string | null; permalink: string | null; occurred_at: string | null; ends_at: string | null; is_all_day: boolean | null; raw_text: string | null };

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const connection = user ? await getConnection(supabase, user.id) : null;

  const { data } = await supabase
    .from("sources")
    .select("id, title, permalink, occurred_at, ends_at, is_all_day, raw_text")
    .eq("source_type", "calendar")
    .order("occurred_at", { ascending: true })
    .limit(100);
  const events = (data ?? []) as EventRow[];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        {connection ? (
          <SyncButton endpoint="/api/google/sync-calendar" label="Sync Calendar" />
        ) : (
          <Link href="/connections" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong">
            Connect Google
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
          <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <CalendarDays className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No events yet</h2>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {events.map((ev) => {
            const location = calendarLocation(ev.raw_text);
            return (
              <li key={ev.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  {ev.permalink ? (
                    <a href={ev.permalink} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-foreground hover:text-accent">
                      {ev.title}
                    </a>
                  ) : (
                    <span className="truncate text-sm font-medium text-foreground">{ev.title}</span>
                  )}
                  {ev.occurred_at && (
                    <span className="shrink-0 text-xs text-muted">{formatEventTime(ev.occurred_at, ev.ends_at ?? undefined, ev.is_all_day ?? false)}</span>
                  )}
                </div>
                {location && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
                    <MapPin className="h-3 w-3" /> {location}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
