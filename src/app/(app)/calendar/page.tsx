import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/google/store";
import { formatEventTime, calendarLocation } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">Calendar</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {events.length > 0 ? `${events.length} upcoming` : "Your synced events"}
          </p>
        </div>
        {connection ? (
          <SyncButton endpoint="/api/google/sync-calendar" label="Sync Calendar" />
        ) : (
          <Button asChild size="sm">
            <Link href="/connections">Connect Google</Link>
          </Button>
        )}
      </header>

      {events.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="text-sm font-semibold text-foreground">No events yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Sync Calendar to see what is coming up.</p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-md border bg-card">
          {events.map((ev) => {
            const location = calendarLocation(ev.raw_text);
            return (
              <li key={ev.id} className="px-3 py-2 transition-colors hover:bg-secondary/40">
                <div className="flex items-center justify-between gap-3">
                  {ev.permalink ? (
                    <a href={ev.permalink} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-foreground hover:text-primary">
                      {ev.title}
                    </a>
                  ) : (
                    <span className="truncate text-sm font-medium text-foreground">{ev.title}</span>
                  )}
                  {ev.occurred_at && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatEventTime(ev.occurred_at, ev.ends_at ?? undefined, ev.is_all_day ?? false)}</span>
                  )}
                </div>
                {location && <p className="mt-0.5 truncate text-xs text-muted-foreground">{location}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
