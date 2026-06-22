"use client";

import { useEffect, useMemo, useState } from "react";
import { Table2, LayoutGrid, Search, Download, X, Trash2 } from "lucide-react";
import { DataTable, type SortState } from "./DataTable";
import type { ColumnDef } from "./types";
import { toCsv, downloadFile } from "./exportCsv";

/**
 * The shared workspace shell for a data page (Contacts, Opportunities). Owns the view toggle
 * (Table default, Grid 4-wide), search, group-by, sort, row selection, optimistic edits, and CSV
 * export. The page supplies its column defs, how to apply an edit locally (`applyEdit`), how to
 * persist it (`persistEdit`), a delete, and a Grid renderer (which reuses the existing cards).
 */

type Row = { id: string };

type Props<R extends Row> = {
  storageKey: string;
  title: string;
  initialRows: R[];
  columns: ColumnDef<R>[];
  groupOptions: { key: string; label: string }[];
  defaultGroupKey?: string | null;
  csvName: string;
  applyEdit: (row: R, key: string, value: string) => R;
  persistEdit: (row: R, key: string, value: string) => Promise<void>;
  deleteRow: (row: R) => Promise<void>;
  renderGrid: (rows: R[]) => React.ReactNode;
  /** Page-specific toolbar actions (New form, Google Sheets export, validate/sync, etc.). */
  toolbarExtra?: React.ReactNode;
};

export function Workspace<R extends Row>({
  storageKey,
  title,
  initialRows,
  columns,
  groupOptions,
  defaultGroupKey = null,
  csvName,
  applyEdit,
  persistEdit,
  deleteRow,
  renderGrid,
  toolbarExtra,
}: Props<R>) {
  const [rows, setRows] = useState<R[]>(initialRows);
  const [view, setView] = useState<"table" | "grid">("table");
  const [query, setQuery] = useState("");
  const [groupKey, setGroupKey] = useState<string | null>(defaultGroupKey);
  const [sort, setSort] = useState<SortState>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  // Keep local rows in sync when the server sends a fresh list (e.g. after router.refresh()).
  useEffect(() => setRows(initialRows), [initialRows]);

  // Remember the view per page.
  useEffect(() => {
    try {
      const v = localStorage.getItem(`jarvis.view.${storageKey}.layout`);
      if (v === "grid" || v === "table") setView(v);
    } catch {
      /* no storage */
    }
  }, [storageKey]);
  function changeView(v: "table" | "grid") {
    setView(v);
    try {
      localStorage.setItem(`jarvis.view.${storageKey}.layout`, v);
    } catch {
      /* no storage */
    }
  }

  function flash(tone: "ok" | "bad", text: string) {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), tone === "ok" ? 1600 : 3200);
  }

  async function onEditCell(row: R, key: string, value: string) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.id === row.id ? applyEdit(r, key, value) : r)));
    try {
      await persistEdit(row, key, value);
      flash("ok", "Saved");
    } catch {
      setRows(prev); // revert
      flash("bad", "Could not save. Try again.");
    }
  }

  async function onDeleteRow(row: R) {
    const prev = rows;
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setSelected((s) => {
      const n = new Set(s);
      n.delete(row.id);
      return n;
    });
    try {
      await deleteRow(row);
    } catch {
      setRows(prev);
      flash("bad", "Could not delete. Try again.");
    }
  }

  // Filter (search across all columns) then sort.
  const displayRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter((r) => columns.some((c) => c.get(r).toLowerCase().includes(q)));
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => {
          const av = col.get(a);
          const bv = col.get(b);
          if (col.type === "date") {
            const at = new Date(av).getTime() || 0;
            const bt = new Date(bv).getTime() || 0;
            return (at - bt) * dir;
          }
          return av.localeCompare(bv) * dir;
        });
      }
    }
    return out;
  }, [rows, query, sort, columns]);

  function onSortChange(key: string) {
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  }

  const selectedRows = displayRows.filter((r) => selected.has(r.id));

  const toolbarBtn = "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-strong transition-colors hover:bg-surface-3";
  const viewBtn = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${active ? "bg-accent text-white" : "text-muted-strong hover:bg-surface-3"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-1 text-lg font-semibold text-foreground">{title}</h1>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">{rows.length}</span>

        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          <button type="button" onClick={() => changeView("table")} className={viewBtn(view === "table")} aria-pressed={view === "table"}>
            <Table2 className="h-3.5 w-3.5" /> Table
          </button>
          <button type="button" onClick={() => changeView("grid")} className={viewBtn(view === "grid")} aria-pressed={view === "grid"}>
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
        </div>

        <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs">
          <span className="text-muted">Group</span>
          <select
            value={groupKey ?? ""}
            onChange={(e) => setGroupKey(e.target.value || null)}
            className="cursor-pointer bg-transparent text-muted-strong outline-none"
            aria-label="Group by"
          >
            <option value="">None</option>
            {groupOptions.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>

        <button type="button" onClick={() => downloadFile(csvName, toCsv(displayRows, columns))} className={toolbarBtn} title="Download as CSV (opens in Sheets or Excel)">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
        {toolbarExtra}
      </div>

      {view === "table" ? (
        <DataTable
          rows={displayRows}
          columns={columns}
          groupByKey={groupKey}
          sort={sort}
          onSortChange={onSortChange}
          onEditCell={onEditCell}
          onDeleteRow={onDeleteRow}
          selectedIds={selected}
          onToggleSelect={(id) =>
            setSelected((s) => {
              const n = new Set(s);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onToggleSelectAll={(on) => setSelected(on ? new Set(displayRows.map((r) => r.id)) : new Set())}
        />
      ) : (
        <div>{renderGrid(displayRows)}</div>
      )}

      {selectedRows.length > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto flex w-fit items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2 shadow-lg">
          <span className="text-sm font-medium text-foreground">{selectedRows.length} selected</span>
          <button type="button" onClick={() => downloadFile(csvName, toCsv(selectedRows, columns))} className={toolbarBtn}>
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <button
            type="button"
            onClick={async () => {
              for (const r of selectedRows) await onDeleteRow(r);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-3 py-1.5 text-sm text-white shadow-lg ${toast.tone === "ok" ? "bg-accent" : "bg-danger"}`}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
