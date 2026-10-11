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
