/**
 * Which stretch of time the local wallet archive actually
 * covers. ESI serves ~30 days of journal; every complete fetch proves its
 * window was seen, and windows are kept as merged intervals so a gap left by
 * an app that stayed closed 30+ days shows as a gap, not as a silent zero.
 * Pure: times are epoch ms.
 */

import { DAY_MS, HOUR_MS } from '@/lib/age';

export const ARCHIVE_DAYS = 365;

/** The oldest ESI-style date (`…Z`, second resolution) an archive keeps, so string compares agree. */
export function archiveCutoffIso(nowMs: number): string {
  return `${new Date(nowMs - ARCHIVE_DAYS * DAY_MS).toISOString().slice(0, 19)}Z`;
}
export const ESI_WALLET_WINDOW_DAYS = 30;
/** ESI may serve a wallet list cached up to this long, so a fetch proves nothing newer. */
export const ESI_WALLET_CACHE_MS = HOUR_MS;

/** `[fromMs, toMs]`, inclusive. */
export type CoverageWindow = readonly [number, number];

export interface FetchWindowInput {
  fetchedAt: number;
  /** Pages were missing, or a cursor walk stopped at its page cap. */
  truncated: boolean;
  /** Oldest entry date the fetch returned, null when it returned none. */
  oldestEntryMs: number | null;
  /** A `from_id` cursor walk (transactions): newest first, so a truncated walk still covers back to its oldest row. */
  cursor?: boolean;
}

/**
 * The window one fetch proves it saw, or null when it proves nothing. A
 * page-paged fetch with a failed page covers nothing (which page was lost is
 * unknown); a truncated cursor walk covers back to its oldest row.
 */
export function fetchWindow(input: FetchWindowInput): CoverageWindow | null {
  const { truncated, oldestEntryMs, cursor } = input;
  // No Last-Modified reaches the loaders, so assume the worst cache age.
  const end = input.fetchedAt - ESI_WALLET_CACHE_MS;
  if (truncated) {
    if (!cursor || oldestEntryMs === null) return null;
    return [Math.min(oldestEntryMs, end), end];
  }
  const start = end - ESI_WALLET_WINDOW_DAYS * DAY_MS;
  return [oldestEntryMs === null ? start : Math.min(start, oldestEntryMs), end];
}

/** `windows` plus `added`, merged, clipped to the last 365 days before `nowMs`. */
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

/** Start of the earliest covered window, null when nothing is covered. */
export function archiveSince(windows: readonly CoverageWindow[]): number | null {
  return windows.length === 0 ? null : Math.min(...windows.map(([from]) => from));
}

/**
 * Uncovered stretches between covered windows. With `nowMs`, also the stretch
 * since the last window when it is older than the cache age: later fetches
 * all failed a page, so that time was never seen.
 */
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
    // A window ends one cache age before its fetch, so a fresh one is already that old.
    const end = Math.max(...sorted.map(([, to]) => to));
    if (nowMs - end > 2 * ESI_WALLET_CACHE_MS) gaps.push([end, nowMs]);
  }
  return gaps;
}
