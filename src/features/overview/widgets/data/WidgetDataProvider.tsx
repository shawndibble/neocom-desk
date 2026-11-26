import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFeedStore } from './feedStore';
import { FeedStoreContext } from './feedStoreContext';
import { FeedSourceMount } from './feedSources';
import { useOverviewRefresh } from './refreshContext';
import { ensureBuilders, feedsFor, type FeedReader } from './models';
import type { FeedId } from './types';

const NO_FEEDS: readonly FeedId[] = [];

export function WidgetDataProvider({
  kinds,
  widgets,
  always = NO_FEEDS,
  children,
}: {
  kinds: readonly string[];
  widgets?: readonly FeedReader[];
  always?: readonly FeedId[];
  children: ReactNode;
}) {
  const [store] = useState(createFeedStore);
  const feeds = useMemo(
    () => [...new Set([...feedsFor(widgets ?? kinds), ...always])].sort(),
    [kinds, widgets, always]
  );
  const { epoch } = useOverviewRefresh();
  useEffect(() => {
    ensureBuilders(kinds).catch(() => undefined);
  }, [kinds, epoch]);
  return (
    <FeedStoreContext.Provider value={store}>
      {feeds.map((feed) => (
        <FeedSourceMount key={feed} feed={feed} />
      ))}
      {children}
    </FeedStoreContext.Provider>
  );
}
