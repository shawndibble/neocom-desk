/**
 * The shared steps of a Corp Board widget read across every corporation (All scope,
 * `CorpAllFeed`): what to draw before there are two corporations' rows to merge.
 * Pure, like every builder.
 */
import type { CorpLabel } from '@/features/corp/corpTicker';
import { blank, corpUnreadable, statusOf } from './builderKit';
import type { CorpAllFeed, CorpFeedBase } from './corpFeeds';
import type { FeedState, KindView } from './types';
import type { Translate } from '@/lib/translate';

/** One corporation's readable read, named for its rows. */
export interface CorpRead<F> {
  corporationId: number;
  feed: F;
  label: CorpLabel;
}

/** A view whose read lost a corporation: the rest still draws, flagged as failed. */
export function flagPartlyFailed(view: KindView, partlyFailed: boolean): KindView {
  return partlyFailed ? { ...view, status: { ...view.status, error: true } } : view;
}

/**
 * The corporations to merge, or the view to draw instead: loading; Retry when the only
 * reads that could answer failed; unreadable; or, with one readable corporation, that
 * corporation's own view (`single`), unchanged but for the failed flag.
 */
export function corpReads<F extends CorpFeedBase>(
  feed: FeedState<CorpAllFeed<F>> | undefined,
  to: string | null,
  t: Translate,
  single: (state: FeedState<F>) => KindView
): { view: KindView } | { reads: CorpRead<F>[]; data: CorpAllFeed<F> } {
  const data = feed?.data;
  if (!feed || !data) return { view: blank(to, statusOf(feed)) };
  const readable = data.corporations.filter(({ feed: read }) => read.readable);
  if (readable.length === 0) {
    if (data.partlyFailed) return { view: blank(to, { ...statusOf(feed), error: true }) };
    const needsReauth = data.corporations.some(({ feed: read }) => read.needsReauth);
    return { view: corpUnreadable(to, feed, needsReauth, t) };
  }
  if (readable.length === 1) {
    return {
      view: flagPartlyFailed(single({ ...feed, data: readable[0]!.feed }), data.partlyFailed),
    };
  }
  return {
    data,
    reads: readable.map((read) => ({
      ...read,
      label: data.labels.get(read.corporationId) ?? {
        ticker: String(read.corporationId),
        name: String(read.corporationId),
      },
    })),
  };
}

/** The oldest of the reads: a list across corporations is only as fresh as its stalest one. */
export function oldestRead(reads: readonly CorpRead<CorpFeedBase>[]): {
  fetchedAt: Date | null;
  fromCache: boolean;
} {
  const dates = reads.flatMap(({ feed }) => (feed.fetchedAt ? [feed.fetchedAt] : []));
  return {
    fetchedAt: dates.length === 0 ? null : dates.reduce((a, b) => (b < a ? b : a)),
    fromCache: reads.some(({ feed }) => feed.fromCache),
  };
}
