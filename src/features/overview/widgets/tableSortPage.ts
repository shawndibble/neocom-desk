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

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(1, page), pageCount(total, perPage));
}

export function pageRows<T>(rows: readonly T[], page: number, perPage: number): T[] {
  const start = (clampPage(page, rows.length, perPage) - 1) * perPage;
  return rows.slice(start, start + perPage);
}

export function pageRange(
  page: number,
  total: number,
  perPage: number
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const current = clampPage(page, total, perPage);
  return { from: (current - 1) * perPage + 1, to: Math.min(current * perPage, total) };
}
