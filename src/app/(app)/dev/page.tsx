"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck, Globe } from "lucide-react";
import { Card } from "@/components/Card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PersonCard } from "@/components/PersonCard";
import { ResearchRunCard } from "@/components/ResearchRunCard";
import type { CardSource } from "@/lib/types";
import type { DiscoveredPerson, ResearchRunView } from "@/lib/research/types";

/**
 * Component lab (P0-T5 demo). Not a real product surface — a place to click the source chip and
 * to see the "no card without a source" guardrail fire.
 */

const emailSource: CardSource = {
  type: "email",
  title: "Re: Grant draft timeline",
  permalink: "https://mail.google.com/mail/u/0/#inbox/FAKE_THREAD_ID",
  occurredAt: "2026-06-15T09:24:00Z",
  quote: "let's get this in by July 29th",
  confidence: 0.92,
};

const meetingSource: CardSource = {
  type: "meeting",
  title: "Weekly sync — Product",
  occurredAt: "2026-06-16T17:00:00Z",
  quote: "Aarav will own the onboarding flow and share a doc by Friday",
  rawText:
    "...so for next steps, let's split this up. Aarav will own the onboarding flow and share a doc by Friday, and Priya will take the analytics dashboard. Sound good? Great, talk next week.",
  confidence: 0.78,
};

const fakePerson: DiscoveredPerson = {
  id: "demo-1",
  fullName: "Dr. Maya Chen",
  company: "Helix Bio (YC W23)",
  roleTitle: "Co-founder & CSO",
  background: "Brown ScB '14; former Ginkgo Bioworks scientist working on enzyme design.",
  relevance: "Brown alum + YC biotech founder — matches your cohort and your 'biotech network' goal.",
  theAsk: "A 20-minute intro call about breaking into computational biology.",
  notes: "Email inferred from company pattern — confirm before sending.",
  sourceQuote: "Maya Chen (Brown '14) co-founded Helix Bio, a YC W23 biotech startup.",
  sourceUrl: "https://www.ycombinator.com/companies/helix-bio",
  confidence: 0.88,
  reviewStatus: "review",
  outreachStatus: "not_emailed",
  channels: [
    { kind: "linkedin", value: "linkedin.com/in/mayachen", verified: true, sourceUrl: "https://www.linkedin.com/in/mayachen", confidence: 0.9 },
    { kind: "email", value: "maya@helixbio.com", verified: false, confidence: 0.4 },
  ],
  goalLinks: [{ goalId: "g1", rationale: "YC biotech founder advances your biotech-network goal.", confidence: 0.8 }],
  fieldSources: {
    company: { url: "https://www.ycombinator.com/companies/helix-bio", quote: "Helix Bio, a YC W23 biotech startup.", confidence: 0.9 },
    role_title: { url: "https://www.helixbio.com/team", quote: "Maya Chen, Co-founder & CSO", confidence: 0.85 },
  },
};

const runningRun: ResearchRunView = {
  id: "demo-running",
  query: "Brown alumni at YC biotech startups",
  targetKind: "people",
  status: "running",
  resultCount: 0,
  createdAt: new Date(0).toISOString(),
  people: [],
};

const doneRun: ResearchRunView = {
  id: "demo-done",
  query: "Brown alumni at YC biotech startups",
  targetKind: "people",
  status: "done",
  resultCount: 1,
  createdAt: new Date(0).toISOString(),
  people: [fakePerson],
};

const errorRun: ResearchRunView = {
  id: "demo-error",
  query: "Brown alumni at YC biotech startups",
  targetKind: "people",
  status: "error",
  resultCount: 0,
  error: "ANTHROPIC_API_KEY is not set.",
  createdAt: new Date(0).toISOString(),
  people: [],
};

export default function DevPage() {
  const [showBroken, setShowBroken] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Component lab</h2>
        <p className="mt-1 text-sm text-muted">
          P0-T5 — the provenance <code className="text-accent">{"<Card>"}</code> primitive. Click a
          source chip to see the exact quote and a link to the original.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">Cards with a source</h3>

        <Card
          title="Submit the grant draft"
          source={emailSource}
          reasoning="The sender set a hard deadline in this thread."
          meta="Due Jul 29"
        >
          Resolved deterministically from the email date, not guessed by the model.
        </Card>

        <Card
          title="Write the onboarding-flow doc"
          source={meetingSource}
          reasoning="You committed to this during the sync."
          meta="Due Fri"
        >
          This one has no external link, so the chip shows the quote highlighted in its transcript
          context instead.
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Guardrail: no card without a source
          </h3>
        </div>
        <p className="text-sm text-muted">
          A <code className="text-accent">{"<Card>"}</code> rendered without a valid source throws a
          clear error in development (and renders nothing in production). Trigger it:
        </p>

        <button
          type="button"
          onClick={() => setShowBroken((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20"
        >
          <AlertTriangle className="h-4 w-4" />
          {showBroken ? "Hide" : "Try to render a source-less card"}
        </button>

        {showBroken && (
          <ErrorBoundary
            fallback={(message) => (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                <p className="font-semibold">Guardrail fired — the card refused to render:</p>
                <p className="mt-1 font-mono text-xs leading-relaxed">{message}</p>
              </div>
            )}
          >
            {/* Intentionally invalid: no source. This throws and is caught above. */}
            <Card title="A task with no provenance" source={undefined as unknown as CardSource}>
              This should never appear.
            </Card>
          </ErrorBoundary>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Auto-populate — discovered person (per-field provenance)
          </h3>
        </div>
        <p className="text-sm text-muted">
          A discovered person rendered via the same <code className="text-accent">{"<Card>"}</code>.
          Click the source chip: the cohort-match quote is the card&apos;s source, and each field
          (company, role, channels) shows its own backing citation in the &ldquo;Per-field
          sources&rdquo; block. (Actions are inert here.)
        </p>
        <PersonCard person={fakePerson} showActions />

        <h3 className="pt-2 text-xs font-medium uppercase tracking-wider text-muted">
          Research run — lifecycle states
        </h3>
        <ResearchRunCard run={runningRun} elapsed={7} onCancel={() => {}} />
        <ResearchRunCard run={doneRun} />
        <ResearchRunCard run={errorRun} onRetry={() => {}} />
      </section>
    </div>
  );
}
