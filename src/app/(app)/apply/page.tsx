import { Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listApplicationRuns } from "@/lib/agents/application/load";
import { PrepareApplicationForm } from "@/components/apply/PrepareApplicationForm";
import { ApplicationRunCard } from "@/components/apply/ApplicationRunCard";
import type { ApplicationKind } from "@/lib/agents/application/types";

export const dynamic = "force-dynamic";

const KINDS: ApplicationKind[] = ["job", "grant", "other"];

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; kind?: string; opportunityId?: string; autostart?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted">Sign in to prepare applications.</p>
      </div>
    );
  }

  const runs = await listApplicationRuns(supabase, user.id);
  const initialKind = (KINDS as string[]).includes(sp.kind ?? "") ? (sp.kind as ApplicationKind) : "job";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Wand2 className="h-5 w-5 text-accent" /> Apply
        </h1>
        <p className="mt-1 text-sm text-muted">
          Paste an application link and Jarvis reads the form, then fills every field it can ground in
          your{" "}
          <a href="/documents" className="text-accent hover:underline">
            documents
          </a>
          . It never submits, you review the field plan and submit yourself.
        </p>
      </header>

      <PrepareApplicationForm
        initialUrl={sp.url ?? ""}
        initialKind={initialKind}
        opportunityId={sp.opportunityId}
        autostart={sp.autostart === "1"}
      />

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <Wand2 className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No applications prepared yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Paste a job or grant link above, or hit “Prepare application” on an Opportunity. Add a resume
            in Documents first so the agent has something to fill from.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <ApplicationRunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
