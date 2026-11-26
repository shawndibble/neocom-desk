import { DAY_MS, HOUR_MS } from '@/lib/age';

export const ARCHIVE_DAYS = 365;

export function archiveCutoffIso(nowMs: number): string {
  return `${new Date(nowMs - ARCHIVE_DAYS * DAY_MS).toISOString().slice(0, 19)}Z`;
}
export const ESI_WALLET_WINDOW_DAYS = 30;
export const ESI_WALLET_CACHE_MS = HOUR_MS;

export type CoverageWindow = readonly [number, number];

export interface FetchWindowInput {
  fetchedAt: number;
  truncated: boolean;
  oldestEntryMs: number | null;
  cursor?: boolean;
}

export function fetchWindow(input: FetchWindowInput): CoverageWindow | null {
  const { truncated, oldestEntryMs, cursor } = input;
  const end = input.fetchedAt - ESI_WALLET_CACHE_MS;
  if (truncated) {
    if (!cursor || oldestEntryMs === null) return null;
    return [Math.min(oldestEntryMs, end), end];
  }
  const start = end - ESI_WALLET_WINDOW_DAYS * DAY_MS;
  return [oldestEntryMs === null ? start : Math.min(start, oldestEntryMs), end];
}

export function addCoverage(
  windows: readonly CoverageWindow[],
  added: CoverageWindow,
  nowMs: number
): Array<[number, number]> {
  const cutoff = nowMs - ARCHIVE_DAYS * DAY_MS;
  const sorted = [...windows, added]
    .filter(([, to]) => to >= cutoff)
    .map(([from, to]): [number, number] => [Math.max(from, cutoff), to])
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

export function archiveSince(windows: readonly CoverageWindow[]): number | null {
  return windows.length === 0 ? null : Math.min(...windows.map(([from]) => from));
}

export function archiveGaps(
  windows: readonly CoverageWindow[],
  nowMs?: number
): Array<[number, number]> {
  const sorted = [...windows].sort((a, b) => a[0] - b[0]);
  const gaps: Array<[number, number]> = [];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i][0] > sorted[i - 1][1]) gaps.push([sorted[i - 1][1], sorted[i][0]]);
  }
  if (nowMs !== undefined && sorted.length > 0) {
    const end = Math.max(...sorted.map(([, to]) => to));
    if (nowMs - end > 2 * ESI_WALLET_CACHE_MS) gaps.push([end, nowMs]);
  }
  return gaps;
}
