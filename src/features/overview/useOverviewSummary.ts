import { useMemo } from 'react';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { useKindViews, viewKey } from './widgets/data/useWidgetView';
import { collectDeadlines, fetchBreakdown, stalestFetch } from './widgets/headerSummary';
import type { Widget } from './widgets/layout';
import { chipTone, nextDeadline } from './widgets/nextDeadline';
import { distinctKinds, visibleWidgets } from './widgets/visibility';

const CLOCK_TICK_MS = 30_000;

/** A kind whose view has not been built yet: no read to date. */
const EMPTY_READ = { fetchedAt: null, fromCache: false };

/** What the header shows of the drawn widgets: the soonest clock and the stalest read. */
export type OverviewSummary = ReturnType<typeof useOverviewSummary>;

/** Read once by the board and handed to each header part, so the kinds are not resolved three times. */
export function useOverviewSummary(widgets: readonly Widget[]) {
  const isPhone = useIsPhone();
  const now = useTicker(CLOCK_TICK_MS);
  const shown = useMemo(() => visibleWidgets(widgets, isPhone), [widgets, isPhone]);
  const requests = useMemo(
    () => distinctKinds(shown).map((kind) => ({ kind, scopeAll: false })),
    [shown]
  );
  const views = useKindViews(requests);
  const all = [...views.values()];
  const next = nextDeadline(collectDeadlines(all), now);
  const breakdown = fetchBreakdown(
    shown.map((widget) => ({
      kind: widget.kind,
      view: views.get(viewKey({ kind: widget.kind, scopeAll: false })) ?? EMPTY_READ,
    }))
  );
  const remaining = next ? next.at - now : 0;
  const stalest = stalestFetch(all);
  return {
    next,
    remaining,
    tone: chipTone(remaining),
    fetchedAt: stalest.date,
    fromCache: stalest.fromCache,
    breakdown,
    now,
  };
}
