"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Sparkles, Plus, Check, X, Mail } from "lucide-react";

type Candidate = {
  id?: string;
  name: string;
  title?: string;
  organization?: string;
  linkedinUrl?: string;
};

/**
 * Discover new people via Apollo.io and import them as contacts. Collapsible, like the manual-add
 * form. Search returns candidates; each can be added individually (created_by 'user', Apollo recorded
 * as the source). Only rendered when Apollo is configured.
 */
export function ApolloFinder() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [added, setAdded] = useState<Record<number, "busy" | "done">>({});

  async function search() {
    if (query.trim().length < 2 && company.trim().length < 2) {
      setErr("Enter a title, keywords, or a company.");
      return;
    }
    setBusy(true);
    setErr(null);
    setResults(null);
    setAdded({});
    try {
      const res = await fetch("/api/apollo/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: query.trim(), company: company.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? "Search failed.");
        return;
      }
      setResults((data?.people ?? []) as Candidate[]);
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function add(i: number, c: Candidate) {
    setAdded((p) => ({ ...p, [i]: "busy" }));
    try {
      const res = await fetch("/api/apollo/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ people: [{ id: c.id, fullName: c.name, company: c.organization, roleTitle: c.title, linkedin: c.linkedinUrl }] }),
      });
      if (res.ok) {
        setAdded((p) => ({ ...p, [i]: "done" }));
        router.refresh();
      } else {
        setAdded((p) => {
          const n = { ...p };
          delete n[i];
          return n;
        });
      }
    } catch {
      setAdded((p) => {
        const n = { ...p };
        delete n[i];
        return n;
      });
    }
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-muted-strong hover:border-accent/50 hover:text-foreground"
      >
        <Sparkles className="h-4 w-4 text-accent" /> Find people with Apollo
      </button>
    );

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Find people with Apollo.io</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void search();
        }}
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
      >
        <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3">
          <Search className="h-4 w-4 shrink-0 text-accent" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title or keywords (e.g. recruiter, founder)"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company (optional)"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
        </button>
      </form>

      {err && <p className="mt-2 text-xs text-danger">{err}</p>}

      {results && results.length === 0 && !busy && <p className="mt-3 text-xs text-muted">No people found. Try different keywords.</p>}

      {results && results.length > 0 && (
        <>
          <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted">
            <Mail className="h-3 w-3" /> Email is looked up via Apollo when you add a person.
          </p>
          <ul className="mt-1.5 space-y-1.5">
          {results.map((c, i) => {
            const state = added[i];
            return (
              <li key={`${c.id ?? c.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted">{[c.title, c.organization].filter(Boolean).join(" @ ") || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void add(i, c)}
                  disabled={!!state}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
                >
                  {state === "done" ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-success" /> Added
                    </>
                  ) : state === "busy" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" /> Add
                    </>
                  )}
                </button>
              </li>
            );
          })}
          </ul>
        </>
      )}
    </div>
  );
}
