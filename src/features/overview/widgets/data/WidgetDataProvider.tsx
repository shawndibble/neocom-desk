/**
 * Mounts the Overview's reads, once, above the grid.
 *
 * One source per *read*, not per widget and not per kind: Training, Skill
 * points and Open orders' slot count all need the skills read, so it is made
 * once and shared. Only the reads the layout's kinds need are mounted, so a
 * widget the pilot never added never fetches (the `IncursionsBoardSource`
 * pattern, for every feed). Each source reports raw `{data, error, loading}`
 * into the feed store; widgets derive their view from it at render time.
 *
 * The cache keys are the old board's, so a return visit still restores each
 * read on its first frame, and a failed refresh still has the last good value
 * behind it (`useRouteSnapshot` hands back the retained snapshot).
 */
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
  /** The distinct Widget Kinds in the layout; only their reads are mounted. */
  kinds: readonly string[];
  /** The drawn widgets, when given: a kind whose reads follow a setting (Profit's Source) mounts only that widget's. */
  widgets?: readonly FeedReader[];
  /** Reads the page itself needs whatever the layout holds (the header's SP chips). */
  always?: readonly FeedId[];
  children: ReactNode;
}) {
  const [store] = useState(createFeedStore);
  // Sorted so the same set of kinds never remounts a source by reordering.
  const feeds = useMemo(
    () => [...new Set([...feedsFor(widgets ?? kinds), ...always])].sort(),
    [kinds, widgets, always]
  );
  // A kind's lazy builder loads with the kind, not with its first read; views rebuild when it lands.
  // A failed load shows failed (the stand-in) and retries on the next Refresh or Retry.
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
