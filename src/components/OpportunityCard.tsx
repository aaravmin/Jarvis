"use client";

import { Check, X, ExternalLink, MapPin, CalendarClock, Wand2 } from "lucide-react";
import { Card } from "@/components/Card";
import { AddToGoal } from "@/components/goals/AddToGoal";
import { OpportunityStatusControl } from "@/components/OpportunityStatusControl";
import { FindLinkedInContactsButton } from "@/components/linkedin/FindLinkedInContactsButton";
import { formatDate, daysUntil } from "@/lib/format";
import type { CardFieldSource, CardSource } from "@/lib/types";
import type { DiscoveredOpportunity, OpportunityCategory } from "@/lib/agents/opportunity/types";

const CATEGORY_LABEL: Record<OpportunityCategory, string> = {
  program: "Program",
  job: "Job",
  internship: "Internship",
  hackathon: "Hackathon",
  fellowship: "Fellowship",
  grant: "Grant",
  scholarship: "Scholarship",
  competition: "Competition",
  accelerator: "Accelerator",
  other: "Opportunity",
};

function confidenceTone(c?: number): string {
  if (typeof c !== "number") return "text-muted";
  if (c >= 0.85) return "text-success";
  if (c >= 0.6) return "text-warning";
  return "text-danger";
}

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Best-effort value for a field_sources key, for display next to its quote in the chip modal. */
function valueForField(o: DiscoveredOpportunity, key: string): string {
  switch (key) {
    case "organization":
      return o.organization ?? "";
    case "location":
      return o.location ?? "";
    case "requirements":
      return o.requirements ?? "";
    case "comp_or_prize":
      return o.compOrPrize ?? "";
    case "how_to_apply_url":
      return o.howToApplyUrl ?? "";
    case "deadline":
    case "raw_deadline":
      return o.rawDeadline ?? "";
    case "required_skills":
      return o.requiredSkills.join(", ");
    case "description":
      return o.description ?? "";
    default:
      return "";
  }
}

/** A small badge for the deadline: relative days when resolved, otherwise the raw string. */
function DeadlineBadge({ o }: { o: DiscoveredOpportunity }) {
  if (!o.rawDeadline && !o.deadlineAt) return null;
  const days = daysUntil(o.deadlineAt);
  let tone = "text-muted";
  let text = o.rawDeadline ?? "";
  if (typeof days === "number") {
    text = days < 0 ? "Closed" : days === 0 ? "Due today" : `${days}d left`;
    tone = days < 0 ? "text-danger" : days <= 7 ? "text-warning" : "text-success";
  }
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${tone}`} title={o.rawDeadline}>
      <CalendarClock className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

/**
 * Renders one discovered opportunity by composing the provenance <Card>. The card's source quote is
 * the validated match snippet; per-field sources ride along in source.fields so every claim shows
 * where it came from. The apply link, deadline (raw string is the source of truth, resolved date is
 * a convenience), location, requirements and required skills are all surfaced.
 */
export function OpportunityCard({
  opportunity: o,
  onAccept,
  onDismiss,
  pending = false,
  showActions = true,
}: {
  opportunity: DiscoveredOpportunity;
  onAccept?: () => void;
  onDismiss?: () => void;
  pending?: boolean;
  showActions?: boolean;
}) {
  const fields: CardFieldSource[] = [];
  for (const [key, fs] of Object.entries(o.fieldSources)) {
    const value = valueForField(o, key);
    if (!value && !fs.quote) continue;
    fields.push({
      label: humanize(key),
      value: value || humanize(key),
      source: { type: "research", quote: fs.quote ?? "", permalink: fs.url, confidence: fs.confidence },
    });
  }

  const source: CardSource = {
    type: "research",
    quote: o.sourceQuote,
    title: "Opportunity match",
    permalink: o.sourceUrl,
    confidence: o.confidence,
    fields: fields.length ? fields : undefined,
  };

  const reasoning = [o.description, o.notes].filter(Boolean).join(", ") || undefined;

  const meta = (
    <div className="flex flex-col items-end gap-0.5">
      <DeadlineBadge o={o} />
      {typeof o.confidence === "number" && (
        <span className={confidenceTone(o.confidence)}>{Math.round(o.confidence * 100)}% match</span>
      )}
    </div>
  );

  const actions = !showActions ? (
    <>
      <OpportunityStatusControl opportunityId={o.id} initial={o.applicationStatus} />
      <AddToGoal entityType="opportunity" entityId={o.id} />
    </>
  ) : o.reviewStatus === "review" ? (
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
        className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
        Accept
      </button>
    </>
  ) : (
    <span className="text-xs text-muted">{o.reviewStatus === "accepted" ? "Accepted" : "Dismissed"}</span>
  );

  const title = o.organization ? `${o.title} · ${o.organization}` : o.title;

  // Which application bucket to hand the Apply agent (it tunes the grounding prompt).
  const applyKind =
    o.category === "grant" || o.category === "fellowship" || o.category === "scholarship"
      ? "grant"
      : o.category === "job" || o.category === "internship"
        ? "job"
        : "other";
  const applyHref = o.howToApplyUrl
    ? `/apply?url=${encodeURIComponent(o.howToApplyUrl)}&kind=${applyKind}&opportunityId=${o.id}&autostart=1`
    : null;

  return (
    <Card title={title} source={source} reasoning={reasoning} meta={meta} actions={actions}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-accent/40 bg-accent-soft/40 px-2 py-0.5 font-medium text-accent">
            {CATEGORY_LABEL[o.category]}
          </span>
          {o.compOrPrize && (
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-muted-strong">
              {o.compOrPrize}
            </span>
          )}
        </div>

        {/* Key facts, one labeled row per fact so each opportunity stays scannable and the details
            never clump together into a wall of text. */}
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 border-t border-border pt-3 text-sm">
          {(o.location || o.isRemote) && (
            <>
              <dt className="flex items-center gap-1 text-muted">
                <MapPin className="h-3.5 w-3.5" />
                Location
              </dt>
              <dd className="text-foreground">
                {o.location || "Remote"}
                {o.location && o.isRemote ? " · Remote OK" : ""}
              </dd>
            </>
          )}
          {(o.rawDeadline || o.deadlineAt) && (
            <>
              <dt className="flex items-center gap-1 text-muted">
                <CalendarClock className="h-3.5 w-3.5" />
                Deadline
              </dt>
              <dd className="text-foreground">
                {o.rawDeadline || "-"}
                {o.deadlineAt && <span className="ml-1.5 text-xs text-muted">({formatDate(o.deadlineAt)})</span>}
              </dd>
            </>
          )}
          {(o.rawEventDates || o.startsAt) && (
            <>
              <dt className="text-muted">Dates</dt>
              <dd className="text-muted-strong">{o.rawEventDates || formatDate(o.startsAt)}</dd>
            </>
          )}
          {o.requirements && (
            <>
              <dt className="text-muted">Requirements</dt>
              <dd className="text-muted-strong">{o.requirements}</dd>
            </>
          )}
          {o.requiredSkills.length > 0 && (
            <>
              <dt className="text-muted">Skills</dt>
              <dd className="flex flex-wrap gap-1.5">
                {o.requiredSkills.map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted-strong"
                  >
                    {s}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        {o.howToApplyUrl && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={o.howToApplyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-muted-strong transition-colors hover:border-accent/40 hover:text-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open application
            </a>
            {applyHref && (
              <a
                href={applyHref}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft/30 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft/50"
                title="Jarvis reads the form and fills it from your documents, you review and submit"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Prepare with Jarvis
              </a>
            )}
          </div>
        )}

        {o.organization && (
          <FindLinkedInContactsButton
            opportunityId={o.id}
            org={o.organization}
            className="border-t border-border pt-3"
          />
        )}
      </div>
    </Card>
  );
}
