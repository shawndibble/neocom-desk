import type { KindView } from './data/types';
import type { BoardDeadline } from './nextDeadline';
import { resolveWidgetState } from './state';

export function collectDeadlines(views: readonly Pick<KindView, 'deadlines'>[]): BoardDeadline[] {
  return views.flatMap((view) => view.deadlines);
}

export function anyStillLoading(views: readonly Pick<KindView, 'status'>[]): boolean {
  return views.some((view) => resolveWidgetState(view.status) === 'loading');
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
  show?: string;
  fetchedAt: Date | null;
}

export function fetchBreakdown(
  entries: readonly { kind: string; show?: string; view: Pick<KindView, 'fetchedAt'> }[]
): FetchRow[] {
  const byKind = new Map<string, FetchRow>();
  for (const { kind, show, view } of entries) {
    if (!byKind.has(kind)) {
      byKind.set(
        kind,
        show ? { kind, show, fetchedAt: view.fetchedAt } : { kind, fetchedAt: view.fetchedAt }
      );
    }
  }
  const time = (row: FetchRow) => row.fetchedAt?.getTime() ?? Infinity;
  return [...byKind.values()].sort((a, b) => time(a) - time(b));
}
