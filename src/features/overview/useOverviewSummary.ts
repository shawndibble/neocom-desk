import { useMemo } from 'react';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { kindHasAllFeeds } from './widgets/data/models';
import { OVERVIEW_TICK_MS } from './widgets/data/tick';
import { useKindViews, viewKey } from './widgets/data/useWidgetView';
import {
  anyStillLoading,
  collectDeadlines,
  fetchBreakdown,
  stalestFetch,
} from './widgets/headerSummary';
import type { Widget } from './widgets/layout';
import { chipTone, nextDeadline } from './widgets/nextDeadline';
import { readScope, useWidgetBoard, type WidgetBoard } from './widgets/board';
import { visibleWidgets } from './widgets/visibility';

/** A kind whose view has not been built yet: no read to date. */
const EMPTY_READ = { fetchedAt: null, fromCache: false };

/**
 * Profit's reads follow its Source, so its request carries it; every other kind's key ignores the field.
 * A kind with an All read of its own (the corp widgets) follows its widget's scope: its header feed
 * is not mounted when every widget of the kind is on All, so asking for it would never settle.
 */
const requestOf = (board: WidgetBoard, widget: Widget) => ({
  kind: widget.kind,
  scopeAll: readScope(board, widget) === 'all' && kindHasAllFeeds(widget.kind),
  profitSource: widget.profitSource,
});

/** What the header shows of the drawn widgets: the soonest clock and the stalest read. */
export type OverviewSummary = ReturnType<typeof useOverviewSummary>;

/** Read once by the board and handed to each header part, so the kinds are not resolved three times. */
export function useOverviewSummary(widgets: readonly Widget[]) {
  const isPhone = useIsPhone();
  const board = useWidgetBoard();
  const { canDraw } = board;
  const now = useTicker(OVERVIEW_TICK_MS);
  const shown = useMemo(
    () => visibleWidgets(widgets, isPhone, canDraw),
    [widgets, isPhone, canDraw]
  );
  const requests = useMemo(() => {
    const byKey = new Map(
      shown.map((widget) => [viewKey(requestOf(board, widget)), requestOf(board, widget)])
    );
    return [...byKey.values()];
  }, [shown, board]);
  const views = useKindViews(requests);
  const all = [...views.values()];
  const next = nextDeadline(collectDeadlines(all), now);
  const breakdown = fetchBreakdown(
    shown.map((widget) => ({
      kind: widget.kind,
      show: widget.show,
      view: views.get(viewKey(requestOf(board, widget))) ?? EMPTY_READ,
    }))
  );
  const remaining = next ? next.at - now : 0;
  const stalest = stalestFetch(all);
  return {
    next,
    remaining,
    /** A clock may still arrive: some drawn kind has not been read yet. */
    pending: views.size < requests.length || anyStillLoading(all),
    tone: chipTone(remaining),
    fetchedAt: stalest.date,
    fromCache: stalest.fromCache,
    breakdown,
    now,
  };
}
