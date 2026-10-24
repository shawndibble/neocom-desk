import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  isNotTrainingAlertEnabledFor,
  useNotificationPreferences,
} from '@/features/notifications/preferences';
import { useTicker } from '@/lib/ticker';
import { useTimeZone } from '@/lib/timeFormat';
import { DEFAULT_PLEX_PER_30_DAYS } from '@/engine/omegaCoverage';
import {
  DEFAULT_RAIDS_RADIUS,
  DEFAULT_RANGE,
  type CalendarEventsChoice,
  type WidgetRange,
} from '../layout';
import type { FeedStore } from './feedStore';
import { useFeedStore } from './feedStoreContext';
import { buildView, KIND_FEEDS } from './models';
import { OVERVIEW_TICK_MS } from './tick';
import type { BuildContext, FeedId, KindView } from './types';

export interface ViewRequest {
  kind: string;
  /** This widget reads across Characters, and its kind can sum them. */
  scopeAll: boolean;
  /** The widget's time window; left out, the default. Two widgets of one kind with different ranges get their own view. */
  range?: WidgetRange;
  /** The widget's Omega plan (PLEX per 30 days); left out, the default. */
  plexPer30Days?: number;
  /** Which calendar events the widget lists; left out, accepted and tentative. */
  calendarEvents?: CalendarEventsChoice;
  /** Skyhook raids: 'near' lists any holder's space within `raidsRadius` jumps; left out, My alliance. */
  raidsWhere?: 'near';
  raidsRadius?: number;
}

export const viewKey = (request: ViewRequest): string =>
  `${request.kind}:${request.scopeAll ? 1 : 0}:${request.range ?? DEFAULT_RANGE}:${request.plexPer30Days ?? DEFAULT_PLEX_PER_30_DAYS}:${request.calendarEvents === 'all' ? 1 : 0}:${request.raidsWhere === 'near' ? (request.raidsRadius ?? DEFAULT_RAIDS_RADIUS) : 0}`;

const NO_FEEDS: readonly FeedId[] = [];

/** The feed reads a kind builds from, as the store's per-feed state objects (identity-stable until that feed changes). */
const feedSlice = (store: FeedStore, feedIds: readonly FeedId[]): readonly unknown[] => {
  const feeds = store.get();
  return feedIds.map((id) => feeds[id]);
};

const sameItems = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((item, i) => item === b[i]);

interface CachedView {
  deps: readonly unknown[];
  view: KindView;
}

/**
 * Built views, shared by every widget and the header summary on one store: the
 * same request is built once per change, not once per reader. An entry is reused
 * while its inputs (own feeds, clock, context) are identical.
 */
const viewCaches = new WeakMap<FeedStore, Map<string, CachedView>>();

function cachedView(
  store: FeedStore,
  request: ViewRequest,
  feedIds: readonly FeedId[],
  ctx: Omit<
    BuildContext,
    'scopeAll' | 'range' | 'plexPer30Days' | 'calendarEvents' | 'raidsWhere' | 'raidsRadius'
  >
): KindView {
  let cache = viewCaches.get(store);
  if (!cache) viewCaches.set(store, (cache = new Map()));
  const id = viewKey(request);
  const deps = [
    ...feedSlice(store, feedIds),
    ctx.t,
    ctx.now,
    ctx.activeCharacterId,
    ctx.notTrainingAlert,
    ctx.zone,
  ];
  const hit = cache.get(id);
  if (hit && sameItems(hit.deps, deps)) return hit.view;
  const feeds = store.get();
  const built = buildView(request.kind, feeds, {
    ...ctx,
    scopeAll: request.scopeAll,
    range: request.range ?? DEFAULT_RANGE,
    plexPer30Days: request.plexPer30Days ?? DEFAULT_PLEX_PER_30_DAYS,
    calendarEvents: request.calendarEvents === 'all' ? 'all' : 'committed',
    raidsWhere: request.raidsWhere === 'near' ? 'near' : 'alliance',
    raidsRadius: request.raidsRadius ?? DEFAULT_RAIDS_RADIUS,
  });
  // Only a first read still out counts: a refresh also reports `loading`, but over data that is
  // already on screen, so the body is at its height.
  const settling = feedIds.some((feedId) => {
    const feed = feeds[feedId];
    return feed?.loading === true && feed.data === null;
  });
  const view = settling ? { ...built, settling } : built;
  cache.set(id, { deps, view });
  return view;
}

/** Views for several kinds at once, rebuilt as their own feeds change and as the clock ticks. */
export function useKindViews(requests: readonly ViewRequest[]): ReadonlyMap<string, KindView> {
  const store = useFeedStore();
  const now = useTicker(OVERVIEW_TICK_MS);
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const zone = useTimeZone();
  const prefs = useNotificationPreferences((state) => state.value);
  const notTrainingAlert =
    activeCharacterId !== null && isNotTrainingAlertEnabledFor(prefs, activeCharacterId);
  // The requests arrive as a fresh array each render; hold the last one with the same content.
  const signature = requests.map(viewKey).join('|');
  const [held, setHeld] = useState({ signature, requests });
  let stable = held.requests;
  if (held.signature !== signature) {
    stable = requests;
    setHeld({ signature, requests });
  }
  const feedIds = useMemo(() => {
    const ids = new Set<FeedId>();
    for (const request of stable)
      for (const id of KIND_FEEDS[request.kind] ?? NO_FEEDS) ids.add(id);
    return [...ids];
  }, [stable]);
  // Re-render only when a feed these kinds read changes, not on any feed's update.
  const last = useRef<readonly unknown[]>([]);
  const getSlice = useCallback(() => {
    const next = feedSlice(store, feedIds);
    if (sameItems(last.current, next)) return last.current;
    last.current = next;
    return next;
  }, [store, feedIds]);
  const slice = useSyncExternalStore(store.subscribe, getSlice);
  return useMemo(() => {
    const views = new Map<string, KindView>();
    for (const request of stable) {
      views.set(
        viewKey(request),
        cachedView(store, request, KIND_FEEDS[request.kind] ?? NO_FEEDS, {
          t,
          now,
          activeCharacterId,
          notTrainingAlert,
          zone,
        })
      );
    }
    return views;
    // `slice` is the signal that an own feed changed; the store read inside is current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stable, store, slice, now, t, activeCharacterId, notTrainingAlert, zone]);
}

/** The view for one widget. */
export function useWidgetView(
  kind: string,
  scopeAll: boolean,
  range?: WidgetRange,
  plexPer30Days?: number,
  calendarEvents?: CalendarEventsChoice,
  raidsWhere?: 'near',
  raidsRadius?: number
): KindView {
  const request = useMemo<ViewRequest>(
    () => ({ kind, scopeAll, range, plexPer30Days, calendarEvents, raidsWhere, raidsRadius }),
    [kind, scopeAll, range, plexPer30Days, calendarEvents, raidsWhere, raidsRadius]
  );
  const requests = useMemo(() => [request], [request]);
  const views = useKindViews(requests);
  return views.get(viewKey(request)) as KindView;
}
