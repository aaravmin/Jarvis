"use client";

import { Check, X } from "lucide-react";
import { Card } from "@/components/Card";
import { AddToGoal } from "@/components/goals/AddToGoal";
import { DraftToContact } from "@/components/google/DraftToContact";
import { ContactStatusControl } from "@/components/ContactStatusControl";
import { RemoveContactButton } from "@/components/RemoveContactButton";
import type { CardFieldSource, CardSource } from "@/lib/types";
import type { DiscoveredPerson } from "@/lib/research/types";

function confidenceTone(c?: number): string {
  if (typeof c !== "number") return "text-muted";
  if (c >= 0.85) return "text-success";
  if (c >= 0.6) return "text-warning";
  return "text-danger";
}

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Best-effort value for a field_sources key, for display next to its quote. */
function valueForField(person: DiscoveredPerson, key: string): string {
  switch (key) {
    case "company":
      return person.company ?? "";
    case "role_title":
    case "role":
      return person.roleTitle ?? "";
    case "background":
      return person.background ?? "";
    case "relevance":
      return person.relevance ?? "";
    case "the_ask":
    case "ask":
      return person.theAsk ?? "";
    case "email":
    case "linkedin":
    case "phone":
    case "x":
    case "website":
      return person.channels.find((c) => c.kind === key)?.value ?? "";
    default:
      return "";
  }
}

/**
 * Renders one discovered person by composing the provenance <Card> (no changes to Card.tsx).
 * The card's source quote is the validated cohort-match snippet; per-field sources (channels +
 * field_sources) ride along in source.fields so every claim shows where it came from.
 */
export function PersonCard({
  person,
  onAccept,
  onDismiss,
  pending = false,
  showActions = true,
}: {
  person: DiscoveredPerson;
  onAccept?: () => void;
  onDismiss?: () => void;
  pending?: boolean;
  showActions?: boolean;
}) {
  const fields: CardFieldSource[] = [];

  for (const ch of person.channels) {
    fields.push({
      label: humanize(ch.kind),
      value: ch.value,
      source: {
        type: "research",
        quote: "", // channels rarely carry a sentence; the chip shows the link + confidence
        permalink: ch.sourceUrl,
        confidence: ch.confidence,
      },
    });
  }
  for (const [key, fs] of Object.entries(person.fieldSources)) {
    const value = valueForField(person, key);
    if (!value && !fs.quote) continue; // nothing to show — skip rather than render a stray "—" row
    fields.push({
      label: humanize(key),
      value: value || humanize(key), // when only a quote exists, label the row instead of leaving it blank
      source: {
        type: "research",
        quote: fs.quote ?? "",
        permalink: fs.url,
        confidence: fs.confidence,
      },
    });
  }

  const source: CardSource = {
    type: "research",
    quote: person.sourceQuote,
    title: "Cohort match",
    permalink: person.sourceUrl,
    confidence: person.confidence,
    fields: fields.length ? fields : undefined,
  };

  const reasoning = [person.relevance, person.notes].filter(Boolean).join(" — ") || undefined;

  const meta =
    typeof person.confidence === "number" ? (
      <span className={`font-semibold ${confidenceTone(person.confidence)}`}>
        {Math.round(person.confidence * 100)}% match
      </span>
    ) : undefined;

  const emailChannel = person.channels.find((c) => c.kind === "email")?.value;
  // A manually-added contact carries no source quote. It legitimately has no provenance, so it must
  // NOT render through <Card> (which throws without a source chip — hard rule #4). It gets its own
  // tile below with an "Added by you" badge instead of a source chip.
  const isManual = !person.sourceQuote.trim();
  const actions = !showActions ? (
    <>
      <ContactStatusControl contactId={person.id} initial={person.outreachStatus} />
      <DraftToContact name={person.fullName} email={emailChannel} />
      <AddToGoal entityType="contact" entityId={person.id} />
      <RemoveContactButton contactId={person.id} name={person.fullName} />
    </>
  ) : person.reviewStatus === "review" ? (
    <>
      <button
        type="button"
        onClick={onDismiss}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-danger/50 hover:text-danger disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        Dismiss
      </button>
      <button
        type="button"
        onClick={onAccept}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-[#04181f] transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        Accept
      </button>
    </>
  ) : (
    <span className="text-xs text-muted">
      {person.reviewStatus === "accepted" ? "Accepted" : "Dismissed"}
    </span>
  );

  const body = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      {person.roleTitle && (
        <>
          <dt className="text-muted">Role</dt>
          <dd className="text-foreground">{person.roleTitle}</dd>
        </>
      )}
      {person.company && (
        <>
          <dt className="text-muted">Company</dt>
          <dd className="text-foreground">{person.company}</dd>
        </>
      )}
      {person.background && (
        <>
          <dt className="text-muted">Background</dt>
          <dd className="text-muted-strong">{person.background}</dd>
        </>
      )}
      {person.theAsk && (
        <>
          <dt className="text-muted">The ask</dt>
          <dd className="text-muted-strong">{person.theAsk}</dd>
        </>
      )}
      {person.channels.length > 0 && (
        <>
          <dt className="text-muted">Contact</dt>
          <dd className="text-muted-strong">
            {person.channels.map((c) => `${c.kind}: ${c.value}`).join(" · ")}
          </dd>
        </>
      )}
    </dl>
  );

  // Manual contact: a non-Card tile (no source chip) styled to match Card so the People grid is
  // consistent. "Added by you" stands in for the provenance chip.
  if (isManual) {
    return (
      <article className="rounded-xl border border-border bg-surface-2 p-4 transition-colors hover:border-border-strong">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold leading-snug text-foreground">{person.fullName}</h3>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
            Added by you
          </span>
        </div>
        <div className="mt-2">{body}</div>
        {reasoning && (
          <p className="mt-2 text-xs italic text-muted">
            <span className="not-italic text-muted-strong">Notes: </span>
            {reasoning}
          </p>
        )}
        {actions && <div className="mt-3 flex items-center justify-end gap-2">{actions}</div>}
      </article>
    );
  }

  return (
    <Card title={person.fullName} source={source} reasoning={reasoning} meta={meta} actions={actions}>
      {body}
    </Card>
  );
}
