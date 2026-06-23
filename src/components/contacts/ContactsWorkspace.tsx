"use client";

import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { Workspace } from "@/components/data/Workspace";
import type { ColumnDef } from "@/components/data/types";
import { PersonCard } from "@/components/PersonCard";
import { ContactsToolbar } from "@/components/contacts/ContactsToolbar";
import { CONTACT_OUTREACH_STATUSES, type DiscoveredPerson } from "@/lib/research/types";

const STATUS_TONE: Record<string, "muted" | "accent" | "success" | "warning"> = {
  not_emailed: "muted",
  emailed: "accent",
  spoke: "success",
  follow_up: "warning",
};

const channelValue = (p: DiscoveredPerson, kind: string) => p.channels.find((c) => c.kind === kind)?.value ?? "";

function setChannel(p: DiscoveredPerson, kind: string, value: string): DiscoveredPerson {
  const others = p.channels.filter((c) => c.kind !== kind);
  const v = value.trim();
  return { ...p, channels: v ? [...others, { kind, value: v, verified: false }] : others };
}

const COLUMNS: ColumnDef<DiscoveredPerson>[] = [
  { key: "fullName", label: "Name", type: "text", editable: true, width: 200, get: (p) => p.fullName },
  {
    key: "status",
    label: "Outreach",
    type: "select",
    editable: true,
    width: 140,
    options: CONTACT_OUTREACH_STATUSES.map((s) => ({ value: s.value, label: s.label, tone: STATUS_TONE[s.value] })),
    get: (p) => p.outreachStatus,
  },
  { key: "company", label: "Company", type: "text", editable: true, width: 160, groupable: true, get: (p) => p.company ?? "" },
  { key: "roleTitle", label: "Role", type: "text", editable: true, width: 170, get: (p) => p.roleTitle ?? "" },
  { key: "email", label: "Email", type: "email", editable: true, width: 200, get: (p) => channelValue(p, "email") },
  { key: "linkedin", label: "LinkedIn", type: "url", editable: true, width: 180, get: (p) => channelValue(p, "linkedin") },
  { key: "relevance", label: "Why", type: "readonly", width: 220, get: (p) => p.relevance ?? "" },
  { key: "notes", label: "Notes", type: "longtext", editable: true, width: 220, get: (p) => p.notes ?? "" },
  {
    key: "source",
    label: "Source",
    type: "readonly",
    width: 110,
    get: (p) => p.sourceUrl ?? p.sourceQuote ?? "",
    render: (p) =>
      p.sourceUrl ? (
        <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" title={p.sourceQuote} className="inline-flex items-center gap-1 text-muted hover:text-accent">
          <Link2 className="h-3 w-3" /> Source
        </a>
      ) : (
        <span className="text-muted" title={p.sourceQuote}>
          Added by you
        </span>
      ),
  },
];

const GROUP_OPTIONS = [
  { key: "status", label: "Outreach" },
  { key: "company", label: "Company" },
];

function applyEdit(p: DiscoveredPerson, key: string, value: string): DiscoveredPerson {
  if (key === "status") return { ...p, outreachStatus: value as DiscoveredPerson["outreachStatus"] };
  if (key === "email") return setChannel(p, "email", value);
  if (key === "linkedin") return setChannel(p, "linkedin", value);
  if (key === "company") return { ...p, company: value };
  if (key === "roleTitle") return { ...p, roleTitle: value };
  if (key === "notes") return { ...p, notes: value };
  if (key === "fullName") return { ...p, fullName: value };
  return p;
}

export function ContactsWorkspace({ people, apolloEnabled }: { people: DiscoveredPerson[]; apolloEnabled: boolean }) {
  const router = useRouter();

  async function persistEdit(row: DiscoveredPerson, key: string, value: string) {
    if (key === "status") {
      const res = await fetch("/api/contacts/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: row.id, outreachStatus: value }),
      });
      if (!res.ok) throw new Error("status");
      return;
    }
    // The contacts PATCH replaces the editable set, so send the full merged view of this row.
    const m = applyEdit(row, key, value);
    const res = await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        fullName: m.fullName,
        company: m.company ?? "",
        roleTitle: m.roleTitle ?? "",
        email: channelValue(m, "email"),
        linkedin: channelValue(m, "linkedin"),
        notes: m.notes ?? "",
      }),
    });
    if (!res.ok) throw new Error("patch");
  }

  async function deleteRow(row: DiscoveredPerson) {
    const res = await fetch(`/api/contacts?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("delete");
    router.refresh();
  }

  return (
    <Workspace
      storageKey="contacts"
      title="People"
      initialRows={people}
      columns={COLUMNS}
      groupOptions={GROUP_OPTIONS}
      csvName="contacts.csv"
      applyEdit={applyEdit}
      persistEdit={persistEdit}
      deleteRow={deleteRow}
      toolbarExtra={people.length > 0 ? <ContactsToolbar apolloEnabled={apolloEnabled} /> : null}
      renderGrid={(rows) => (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((p) => (
            <div key={p.id} className="min-w-0">
              <PersonCard person={p} showActions={false} apolloEnabled={apolloEnabled} />
            </div>
          ))}
        </div>
      )}
    />
  );
}
