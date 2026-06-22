"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, ExternalLink, Trash2 } from "lucide-react";
import type { ColumnDef, SelectOption, Tone } from "./types";

/**
 * A dense, spreadsheet-style table. One component serves Contacts and Opportunities via declarative
 * column defs. Features: sticky header, group-by with collapsible sections + counts, click-header sort,
 * inline editing (select columns edit in one click; text/date/link columns edit on double-click or
 * Enter, commit on blur/Enter, revert on Escape), row selection, and per-row delete on hover. The
 * parent owns the row data and performs the optimistic update + persistence in `onEditCell`.
 */

type Row = { id: string };

const TONE_DOT: Record<Tone, string> = {
  muted: "bg-muted",
  strong: "bg-muted-strong",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

type Props<R extends Row> = {
  rows: R[];
  columns: ColumnDef<R>[];
  groupByKey?: string | null;
  sort: SortState;
  onSortChange: (key: string) => void;
  /** Persist one cell edit. The parent applies the optimistic update + calls the API + toasts. */
  onEditCell: (row: R, key: string, value: string) => void;
  onDeleteRow: (row: R) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (on: boolean) => void;
};

function optionFor(col: { options?: SelectOption[] }, value: string): SelectOption | undefined {
  return col.options?.find((o) => o.value === value);
}

/** Friendly date display from an ISO/date string; passthrough if it is not parseable. */
function friendlyDate(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** yyyy-mm-dd for a date input, from an ISO/date string. Empty when unparseable. */
function toDateInput(raw: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function DataTable<R extends Row>({
  rows,
  columns,
  groupByKey,
  sort,
  onSortChange,
  onEditCell,
  onDeleteRow,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props<R>) {
  // The cell currently in edit mode, as "rowId::colKey".
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const groupCol = groupByKey ? columns.find((c) => c.key === groupByKey) : undefined;

  // Bucket rows into groups (one "All" group when not grouping), preserving incoming row order.
  const groups = useMemo(() => {
    if (!groupCol) return [{ key: "__all__", label: "", rows }];
    const map = new Map<string, R[]>();
    for (const r of rows) {
      const raw = groupCol.get(r) || "";
      const label = optionFor(groupCol, raw)?.label ?? (raw || "None");
      const arr = map.get(label) ?? [];
      arr.push(r);
      map.set(label, arr);
    }
    return [...map.entries()].map(([label, rs]) => ({ key: label, label, rows: rs }));
  }, [groupCol, rows]);

  function beginEdit(row: R, col: ColumnDef<R>) {
    if (!col.editable || col.type === "select" || col.type === "readonly") return;
    setEditing(`${row.id}::${col.key}`);
    setDraft(col.type === "date" ? toDateInput(col.get(row)) : col.get(row));
  }

  function commit(row: R, col: ColumnDef<R>) {
    const original = col.type === "date" ? toDateInput(col.get(row)) : col.get(row);
    if (draft !== original) onEditCell(row, col.key, draft);
    setEditing(null);
  }

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-20">
          <tr className="bg-surface-3 text-left">
            <th className="w-10 border-b border-r border-border px-2 py-2">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allVisibleSelected}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
                className="accent-accent"
              />
            </th>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`whitespace-nowrap border-b border-r border-border px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-strong ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSortChange(col.key)}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    title="Sort by this column"
                  >
                    {col.label}
                    {active ? (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
                  </button>
                </th>
              );
            })}
            <th className="w-10 border-b border-border px-2 py-2" aria-label="Row actions" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <Fragment key={g.key}>
                {groupCol && (
                  <tr className="bg-surface-2/60">
                    <td colSpan={columns.length + 2} className="border-b border-border px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.key)) next.delete(g.key);
                            else next.add(g.key);
                            return next;
                          })
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"
                      >
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {g.label || "None"}
                        <span className="ml-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted">{g.rows.length}</span>
                      </button>
                    </td>
                  </tr>
                )}
                {!isCollapsed &&
                  g.rows.map((row) => (
                    <tr key={row.id} className="group/row hover:bg-surface-3/40">
                      <td className="border-b border-r border-border px-2 py-1.5 align-top">
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={selectedIds.has(row.id)}
                          onChange={() => onToggleSelect(row.id)}
                          className={`accent-accent ${selectedIds.has(row.id) ? "" : "opacity-0 group-hover/row:opacity-100"}`}
                        />
                      </td>
                      {columns.map((col, ci) => {
                        const cellKey = `${row.id}::${col.key}`;
                        const isEditing = editing === cellKey;
                        const value = col.get(row);
                        return (
                          <td
                            key={col.key}
                            style={{ width: col.width }}
                            onDoubleClick={() => beginEdit(row, col)}
                            className={`border-b border-r border-border px-2 py-1.5 align-top ${ci === 0 ? "font-medium text-foreground" : "text-muted-strong"} ${col.align === "right" ? "text-right" : ""} ${col.editable && col.type !== "select" ? "cursor-text" : ""}`}
                          >
                            {isEditing ? (
                              col.type === "longtext" ? (
                                <textarea
                                  ref={(el) => {
                                    inputRef.current = el;
                                    el?.focus();
                                  }}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commit(row, col)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditing(null);
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      commit(row, col);
                                    }
                                  }}
                                  rows={2}
                                  className="w-full resize-none rounded border border-accent bg-surface px-1.5 py-1 text-[13px] text-foreground outline-none"
                                />
                              ) : (
                                <input
                                  ref={(el) => {
                                    inputRef.current = el;
                                    el?.focus();
                                  }}
                                  type={col.type === "date" ? "date" : "text"}
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => commit(row, col)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditing(null);
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      commit(row, col);
                                    }
                                  }}
                                  className="w-full rounded border border-accent bg-surface px-1.5 py-1 text-[13px] text-foreground outline-none"
                                />
                              )
                            ) : (
                              <CellDisplay col={col} row={row} value={value} onEditCell={onEditCell} />
                            )}
                          </td>
                        );
                      })}
                      <td className="border-b border-border px-1 py-1.5 align-top">
                        <button
                          type="button"
                          onClick={() => onDeleteRow(row)}
                          aria-label="Delete row"
                          className="opacity-0 transition-opacity hover:text-danger group-hover/row:opacity-100"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Nothing here yet.</p>}
    </div>
  );
}

/** Read-mode rendering of a cell by column type (pill, link, date, tags, or plain text). */
function CellDisplay<R extends Row>({
  col,
  row,
  value,
  onEditCell,
}: {
  col: ColumnDef<R>;
  row: R;
  value: string;
  onEditCell: (row: R, key: string, value: string) => void;
}) {
  if (col.render) return <>{col.render(row)}</>;

  if (col.type === "select") {
    const opt = optionFor(col, value);
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[opt?.tone ?? "muted"]}`} aria-hidden />
        <select
          value={value}
          onChange={(e) => onEditCell(row, col.key, e.target.value)}
          aria-label={col.label}
          className="cursor-pointer rounded bg-transparent text-[13px] text-foreground outline-none hover:text-accent"
        >
          {col.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    );
  }

  if (!value) return <span className="select-none text-muted/30">&nbsp;</span>;

  if (col.type === "email") {
    return (
      <a href={`mailto:${value}`} className="text-accent hover:underline">
        {value}
      </a>
    );
  }
  if (col.type === "url") {
    const href = col.href?.(row) ?? value;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
        <span className="truncate">{value.replace(/^https?:\/\//, "")}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
      </a>
    );
  }
  if (col.type === "date") return <span>{friendlyDate(value)}</span>;
  if (col.type === "tags") {
    const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    return (
      <span className="flex flex-wrap gap-1">
        {tags.map((t, i) => (
          <span key={i} className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">
            {t}
          </span>
        ))}
      </span>
    );
  }
  return <span className={col.type === "longtext" ? "line-clamp-2 whitespace-pre-wrap" : "truncate"}>{value}</span>;
}
