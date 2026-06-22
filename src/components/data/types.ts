import type { ReactNode } from "react";

/**
 * Column model for the spreadsheet-style DataTable. A column knows how to read its value off a row
 * (`get`), what kind of editor it uses (`type`), and whether it can be edited inline. Keeping this
 * declarative lets one DataTable serve both Contacts and Opportunities.
 */

export type ColumnType =
  | "text" // single-line, click-to-edit
  | "longtext" // notes etc., still single-line edit but wraps on display
  | "select" // one colored pill from a fixed option list
  | "email" // mailto link, edit via double-click
  | "url" // external link, edit via double-click
  | "date" // shown as a friendly date, edited with a native date picker
  | "tags" // comma-separated list shown as pills (edit as comma text)
  | "readonly"; // never editable (provenance, derived)

export type Tone = "muted" | "strong" | "accent" | "success" | "warning" | "danger";

export type SelectOption = { value: string; label: string; tone?: Tone };

export type ColumnDef<R> = {
  key: string;
  label: string;
  type: ColumnType;
  /** Editable inline. Defaults to false. The primary (first) column is editable text by convention. */
  editable?: boolean;
  /** Fixed pixel width; the table is horizontally scrollable. */
  width?: number;
  align?: "left" | "right";
  /** Options for a `select` column. */
  options?: SelectOption[];
  /** Read the cell's string value off the row (for display, edit, search, sort, export). */
  get: (row: R) => string;
  /** For email/url columns: the href to link to (defaults to the value). */
  href?: (row: R) => string | undefined;
  /** Can this column be used to group rows? */
  groupable?: boolean;
  /** Custom read-only renderer (e.g. a source chip). Overrides the default text render. */
  render?: (row: R) => ReactNode;
};
