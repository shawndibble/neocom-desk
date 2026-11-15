import { useMemo } from 'react';
import { duePeriods } from '@/engine/corpTaxBook/bookView';
import { uncountedToShow } from '@/engine/corpTaxBook/uncounted';
import { useBook } from './useBook';
import { useTabsProjection } from './useTabsProjection';

/**
 * Everything the Overview's "Needs you" lists, and how many cards that is: the
 * book's own items, tax noted in a division the book does not read (#6207),
 * and one card when a Statement run is due (#6208). The panel and the Moons nav
 * dot read the same count.
 */
export function useNeedsYou() {
  const { view, data, settings } = useBook();
  const { needsYou } = useTabsProjection();
  const uncounted = useMemo(
    () => uncountedToShow({ donations: data.uncounted ?? [] }, settings.divisions),
    [data.uncounted, settings.divisions]
  );
  const runDue = useMemo(() => duePeriods(view), [view]);
  return {
    needsYou,
    uncounted,
    runDue,
    count: needsYou.length + uncounted.length + (runDue.length > 0 ? 1 : 0),
  };
}
