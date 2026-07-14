import { Mic } from "lucide-react";
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
    <div className="mx-auto max-w-3xl space-y-4">
      <PasteMeetingForm />

      {meetings.length === 0 ? (
        <div className="flex min-h-[28vh] flex-col items-center justify-center text-center">
          <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Mic className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No meetings yet</h2>
          <p className="mt-1 text-xs text-muted">Paste a transcript above and GOTT pulls the action items.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {meetings.map((m) => {
            const c = counts.get(m.id) ?? { review: 0, accepted: 0 };
            const total = c.review + c.accepted;
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{m.title || "Meeting"}</p>
                  <p className="text-xs text-muted">
                    {total === 0
                      ? "No action items"
                      : `${total} action ${total === 1 ? "item" : "items"}${c.review ? ` · ${c.review} in review` : ""}`}
                  </p>
                </div>
                {m.occurred_at && <span className="shrink-0 text-xs text-muted">{formatDate(m.occurred_at)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
