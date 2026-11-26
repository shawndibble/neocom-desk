import { useMemo } from 'react';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { kindHasAllFeeds, kindSumsAcrossCharacters } from './widgets/data/models';
import { OVERVIEW_TICK_MS } from './widgets/data/tick';
import { useKindViews, viewKey } from './widgets/data/useWidgetView';
import {
  anyStillLoading,
  collectDeadlines,
  fetchBreakdown,
  stalestFetch,
} from './widgets/headerSummary';
import { scopeCorporation, type Widget } from './widgets/layout';
import { chipTone, nextDeadline } from './widgets/nextDeadline';
import { readScope, useWidgetBoard, type WidgetBoard } from './widgets/board';
import { visibleWidgets } from './widgets/visibility';

const EMPTY_READ = { fetchedAt: null, fromCache: false };

function across(board: WidgetBoard, widget: Widget) {
  const scope = readScope(board, widget);
  const sums =
    scope !== 'header' &&
    kindHasAllFeeds(widget.kind) &&
    kindSumsAcrossCharacters(widget.kind, widget);
  const corporationId = scopeCorporation(scope);
  return { scopeAll: sums, ...(sums && corporationId !== null && { corporationId }) };
}

const requestOf = (board: WidgetBoard, widget: Widget) => ({
  kind: widget.kind,
  ...across(board, widget),
  profitSource: widget.profitSource,
});

export type OverviewSummary = ReturnType<typeof useOverviewSummary>;

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
    pending: views.size < requests.length || anyStillLoading(all),
    tone: chipTone(remaining),
    fetchedAt: stalest.date,
    fromCache: stalest.fromCache,
    breakdown,
    now,
  };
}
