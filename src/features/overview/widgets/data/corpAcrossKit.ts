import type { CorpLabel } from '@/features/corp/corpTicker';
import { acrossCorporations, blank, corpUnreadable, statusOf, type Builder } from './builderKit';
import type { CorpAllFeed, CorpFeedBase } from './corpFeeds';
import type { FeedId, FeedState, KindView } from './types';
import type { Translate } from '@/lib/translate';

export interface CorpRead<F> {
  corporationId: number;
  feed: F;
  label: CorpLabel;
}

export function flagPartlyFailed(view: KindView, partlyFailed: boolean): KindView {
  return partlyFailed ? { ...view, status: { ...view.status, error: true } } : view;
}

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

export function acrossFeed(build: Builder, one: FeedId, all: FeedId): Builder {
  return (feeds, ctx) => {
    if (!ctx.scopeAll) return build(feeds, ctx);
    const state = feeds[all] as FeedState<CorpFeedBase> | undefined;
    const view = build({ ...feeds, [one]: state }, ctx);
    return state?.data ? acrossCorporations(view, state.data, ctx.t) : view;
  };
}
