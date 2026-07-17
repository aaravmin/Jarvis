import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { PasteMeetingForm } from "@/components/meetings/PasteMeetingForm";

export const dynamic = "force-dynamic";

type MeetingRow = { id: string; title: string | null; occurred_at: string | null };
type ItemRow = { source_id: string | null; status: string };

export default async function MeetingsPage() {
  const supabase = await createClient();

  const { data: srcData } = await supabase
    .from("sources")
    .select("id, title, occurred_at")
    .eq("source_type", "meeting")
    .order("created_at", { ascending: false })
    .limit(20);
  const meetings = (srcData ?? []) as MeetingRow[];

  // Per-meeting action-item counts (review vs accepted) so the user sees what each transcript produced.
  const ids = meetings.map((m) => m.id);
  const counts = new Map<string, { review: number; accepted: number }>();
  if (ids.length) {
    const { data: itemData } = await supabase.from("items").select("source_id, status").in("source_id", ids);
    for (const it of (itemData ?? []) as ItemRow[]) {
      if (!it.source_id) continue;
      const c = counts.get(it.source_id) ?? { review: 0, accepted: 0 };
      if (it.status === "review") c.review++;
      else if (it.status === "accepted" || it.status === "done") c.accepted++;
      counts.set(it.source_id, c);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-base font-semibold tracking-tight text-foreground">Meetings</h1>
      </header>

      <PasteMeetingForm />

      {meetings.length === 0 ? (
        <div className="rounded-md border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="text-sm font-semibold text-foreground">No meetings yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Paste a transcript above and Otto pulls the action items.</p>
        </div>
      ) : (
        <section className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</h2>
            <span className="text-[11px] text-muted-foreground">{meetings.length}</span>
          </div>
          <ul className="divide-y overflow-hidden rounded-md border bg-card">
            {meetings.map((m) => {
              const c = counts.get(m.id) ?? { review: 0, accepted: 0 };
              const total = c.review + c.accepted;
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-secondary/40">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{m.title || "Meeting"}</p>
                    <p className="text-xs text-muted-foreground">
                      {total === 0
                        ? "No action items"
                        : `${total} action ${total === 1 ? "item" : "items"}${c.review ? ` · ${c.review} in review` : ""}`}
                    </p>
                  </div>
                  {m.occurred_at && <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(m.occurred_at)}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
