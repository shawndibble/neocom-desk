/**
 * Sorting and paging for a widget's Table view, as pure functions.
 *
 * Sorting reads `TableRowModel.sort` (one key per column) rather than the cell
 * text, which is display-only. The comparison itself is the DataTable's
 * (`sortRowsBy`: stable, collator for strings, missing keys last in both
 * directions) so the two tables can never order the same data differently.
 */
import { sortRowsBy } from '@/components/ui/dataTableSort';
import type { TableRowModel } from './data/types';

export const ROWS_PER_PAGE_OPTIONS = [5, 10, 25] as const;
export type RowsPerPage = (typeof ROWS_PER_PAGE_OPTIONS)[number];
export const DEFAULT_ROWS_PER_PAGE: RowsPerPage = 10;

export function isRowsPerPage(value: unknown): value is RowsPerPage {
  return ROWS_PER_PAGE_OPTIONS.some((option) => option === value);
}

export function sortTableRows(
  rows: readonly TableRowModel[],
  columnIndex: number,
  direction: 'asc' | 'desc'
): TableRowModel[] {
  return sortRowsBy(rows, (row) => row.sort?.[columnIndex], direction);
}

/** Never fewer than one: an empty table is still on page 1. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** A page held in state outlives the rows it was chosen from; this keeps it on screen after they shrink. */
export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(1, page), pageCount(total, perPage));
}

export function pageRows<T>(rows: readonly T[], page: number, perPage: number): T[] {
  const start = (clampPage(page, rows.length, perPage) - 1) * perPage;
  return rows.slice(start, start + perPage);
}

/** The 1-based range a page shows ("6–10 of 23"); 0–0 when there is nothing. */
export function pageRange(
  page: number,
  total: number,
  perPage: number
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const current = clampPage(page, total, perPage);
  return { from: (current - 1) * perPage + 1, to: Math.min(current * perPage, total) };
}
