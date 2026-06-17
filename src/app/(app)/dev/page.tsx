"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Card } from "@/components/Card";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { CardSource } from "@/lib/types";

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
    </div>
  );
}
