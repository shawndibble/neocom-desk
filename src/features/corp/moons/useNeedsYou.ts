import { useMemo } from 'react';
import {
  planStatementRuns,
  type BookView,
  type NeedsYouItem,
  type PlannedRun,
} from '@/engine/corpTaxBook/bookView';
import { uncountedToShow } from '@/engine/corpTaxBook/uncounted';
import { disputesToShow } from '@/engine/corpTaxBook/disputes';
import type { BookData } from '../taxBook/bookClient';
import { useBook } from './useBook';
import { useTabsProjection } from './useTabsProjection';

const runsByView = new WeakMap<BookView, PlannedRun[]>();

/**
 * The run's periods for this view, planned once however many places ask: each missed period
 * rebuilds the book, and the publisher, "Needs you" and the run all read it on one render.
 */
export function plannedRuns(view: BookView): PlannedRun[] {
  let runs = runsByView.get(view);
  if (runs === undefined) {
    runs = planStatementRuns(view);
    runsByView.set(view, runs);
  }
  return runs;
}

/**
 * Everything the Overview's "Needs you" lists, and how many cards that is: the
 * book's own items (`needsYou`, the tabs projection's), tax noted in a division the
 * book does not read (#6207), a Miner's dispute of a Conflict day until it is dismissed
 * or rejected (#6206), and one card when a Statement run is due (#6208). The panel, the
 * Moons visit and the Moons nav dot's background poll all count it here.
 */
export function needsYouOf(
  view: BookView,
  data: Pick<BookData, 'uncounted' | 'disputes'>,
  divisions: readonly number[],
  needsYou: NeedsYouItem[]
) {
  const uncounted = uncountedToShow({ donations: data.uncounted ?? [] }, divisions);
  const disputes = disputesToShow(data.disputes ?? [], view.input.dismissals);
  const runDue = plannedRuns(view).map((run) => run.plan.period);
  return {
    needsYou,
    uncounted,
    disputes,
    runDue,
    count: needsYou.length + uncounted.length + disputes.length + (runDue.length > 0 ? 1 : 0),
  };
}

/** `needsYouOf` for the open book. */
export function useNeedsYou() {
  const { view, data, settings } = useBook();
  const { needsYou } = useTabsProjection();
  return useMemo(
    () => needsYouOf(view, data, settings.divisions, needsYou),
    [view, data, settings.divisions, needsYou]
  );
}
