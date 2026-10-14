/**
 * What the Overview header reads off the widgets on screen: their clocks (for
 * the Next deadline chip) and how old the stalest read is (for "Updated N
 * ago"). A countdown is only as fresh as the fetch it was computed from, so
 * the stalest read is the honest age for the whole page.
 */
import type { KindView } from './data/types';
import type { BoardDeadline } from './nextDeadline';

export function collectDeadlines(views: readonly Pick<KindView, 'deadlines'>[]): BoardDeadline[] {
  return views.flatMap((view) => view.deadlines);
}

export function stalestFetch(views: readonly Pick<KindView, 'fetchedAt' | 'fromCache'>[]): {
  date: Date | null;
  fromCache: boolean;
} {
  let date: Date | null = null;
  let fromCache = false;
  for (const view of views) {
    if (view.fromCache) fromCache = true;
    if (view.fetchedAt && (date === null || view.fetchedAt < date)) date = view.fetchedAt;
  }
  return { date, fromCache };
}

export interface FetchRow {
  kind: string;
  fetchedAt: Date | null;
}

/**
 * One row per kind on screen (two widgets of a kind share a read), stalest
 * first so the row that sets the header's age leads; kinds never read sit last.
 */
export function fetchBreakdown(
  entries: readonly { kind: string; view: Pick<KindView, 'fetchedAt'> }[]
): FetchRow[] {
  const byKind = new Map<string, FetchRow>();
  for (const { kind, view } of entries) {
    if (!byKind.has(kind)) {
      byKind.set(kind, { kind, fetchedAt: view.fetchedAt });
    }
  }
  const time = (row: FetchRow) => row.fetchedAt?.getTime() ?? Infinity;
  return [...byKind.values()].sort((a, b) => time(a) - time(b));
}
