"use client";

import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { Workspace } from "@/components/data/Workspace";
import type { ColumnDef, Tone } from "@/components/data/types";
import { OpportunityCard } from "@/components/OpportunityCard";
import { APPLICATION_STATUSES, type DiscoveredOpportunity, type OpportunityCategory } from "@/lib/agents/opportunity/types";

const STATUS_TONE: Record<string, Tone> = {
  not_applied: "muted",
  waiting_to_open: "strong",
  applied: "accent",
  interviewing: "warning",
  accepted: "success",
  rejected: "danger",
};

const CATEGORY_OPTIONS: { value: OpportunityCategory; label: string }[] = [
  { value: "program", label: "Program" },
  { value: "job", label: "Job" },
  { value: "internship", label: "Internship" },
  { value: "hackathon", label: "Hackathon" },
  { value: "fellowship", label: "Fellowship" },
  { value: "grant", label: "Grant" },
  { value: "scholarship", label: "Scholarship" },
  { value: "competition", label: "Competition" },
  { value: "accelerator", label: "Accelerator" },
  { value: "other", label: "Other" },
];

const COLUMNS: ColumnDef<DiscoveredOpportunity>[] = [
  { key: "title", label: "Title", type: "text", editable: true, width: 240, get: (o) => o.title },
  {
    key: "status",
    label: "Stage",
    type: "select",
    editable: true,
    width: 150,
    options: APPLICATION_STATUSES.map((s) => ({ value: s.value, label: s.label, tone: STATUS_TONE[s.value] })),
    get: (o) => o.applicationStatus,
  },
  {
    key: "category",
    label: "Type",
    type: "select",
    editable: true,
    width: 130,
    options: CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: c.label, tone: "muted" as Tone })),
    get: (o) => o.category,
  },
  { key: "organization", label: "Organization", type: "text", editable: true, width: 170, groupable: true, get: (o) => o.organization ?? "" },
  { key: "rawDeadline", label: "Deadline", type: "date", editable: true, width: 140, get: (o) => o.deadlineAt ?? o.rawDeadline ?? "" },
  { key: "compOrPrize", label: "Comp / Prize", type: "text", editable: true, width: 130, get: (o) => o.compOrPrize ?? "" },
  { key: "location", label: "Location", type: "text", editable: true, width: 140, get: (o) => o.location ?? "" },
  { key: "howToApplyUrl", label: "Link", type: "url", editable: true, width: 160, get: (o) => o.howToApplyUrl ?? "" },
  { key: "requiredSkills", label: "Skills", type: "tags", editable: true, width: 200, get: (o) => (o.requiredSkills ?? []).join(", ") },
  { key: "notes", label: "Notes", type: "longtext", editable: true, width: 220, get: (o) => o.notes ?? "" },
  {
    key: "source",
    label: "Source",
    type: "readonly",
    width: 110,
    get: (o) => o.sourceUrl ?? o.sourceQuote ?? "",
    render: (o) =>
      o.sourceUrl ? (
        <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" title={o.sourceQuote} className="inline-flex items-center gap-1 text-muted hover:text-accent">
          <Link2 className="h-3 w-3" /> Source
        </a>
      ) : (
        <span className="text-muted" title={o.sourceQuote}>
          Added by you
        </span>
      ),
  },
];

const GROUP_OPTIONS = [
  { key: "status", label: "Stage" },
  { key: "category", label: "Type" },
  { key: "organization", label: "Organization" },
];

function applyEdit(o: DiscoveredOpportunity, key: string, value: string): DiscoveredOpportunity {
  switch (key) {
    case "status":
      return { ...o, applicationStatus: value as DiscoveredOpportunity["applicationStatus"] };
    case "category":
      return { ...o, category: value as OpportunityCategory };
    case "title":
      return { ...o, title: value };
    case "organization":
      return { ...o, organization: value };
    case "location":
      return { ...o, location: value };
    case "compOrPrize":
      return { ...o, compOrPrize: value };
    case "howToApplyUrl":
      return { ...o, howToApplyUrl: value };
    case "notes":
      return { ...o, notes: value };
    case "requiredSkills":
      return { ...o, requiredSkills: value.split(",").map((s) => s.trim()).filter(Boolean) };
    case "rawDeadline":
      return { ...o, rawDeadline: value, deadlineAt: value };
    default:
      return o;
  }
}

export function OpportunitiesWorkspace({ opportunities }: { opportunities: DiscoveredOpportunity[] }) {
  const router = useRouter();

  async function persistEdit(row: DiscoveredOpportunity, key: string, value: string) {
    if (key === "status") {
      const res = await fetch("/api/opportunities/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ opportunityId: row.id, applicationStatus: value }),
      });
      if (!res.ok) throw new Error("status");
      return;
    }
    const res = await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: row.id, [key]: value }),
    });
    if (!res.ok) throw new Error("patch");
  }

  async function deleteRow(row: DiscoveredOpportunity) {
    const res = await fetch(`/api/opportunities?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete");
    router.refresh();
  }

  return (
    <Workspace
      storageKey="opportunities"
      title="Opportunities"
      initialRows={opportunities}
      columns={COLUMNS}
      groupOptions={GROUP_OPTIONS}
      csvName="opportunities.csv"
      applyEdit={applyEdit}
      persistEdit={persistEdit}
      deleteRow={deleteRow}
      renderGrid={(rows) => (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} showActions={false} />
          ))}
        </div>
      )}
    />
  );
}
