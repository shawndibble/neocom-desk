import { useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveCharacter } from '@/stores/activeCharacter';
import {
  isNotTrainingAlertEnabledFor,
  useNotificationPreferences,
} from '@/features/notifications/preferences';
import { useTicker } from '@/lib/ticker';
import { DEFAULT_RANGE, type WidgetRange } from '../layout';
import { useFeedStore } from './feedStoreContext';
import { buildView } from './models';
import type { KindView } from './types';

/** Countdowns read in whole minutes, so half a minute keeps them honest without a render storm. */
const TICK_MS = 30_000;

export interface ViewRequest {
  kind: string;
  /** This widget reads across Characters, and its kind can sum them. */
  scopeAll: boolean;
  /** The widget's time window; left out, the default. Two widgets of one kind with different ranges get their own view. */
  range?: WidgetRange;
}

export const viewKey = (request: ViewRequest): string =>
  `${request.kind}:${request.scopeAll ? 1 : 0}:${request.range ?? DEFAULT_RANGE}`;

/** Views for several kinds at once, rebuilt as their feeds change and as the clock ticks. */
export function useKindViews(requests: readonly ViewRequest[]): ReadonlyMap<string, KindView> {
  const store = useFeedStore();
  const feeds = useSyncExternalStore(store.subscribe, store.get);
  const now = useTicker(TICK_MS);
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const prefs = useNotificationPreferences((state) => state.value);
  const notTrainingAlert =
    activeCharacterId !== null && isNotTrainingAlertEnabledFor(prefs, activeCharacterId);
  // The requests arrive as a fresh array each render; key on their content.
  const key = requests.map(viewKey).join('|');
  return useMemo(() => {
    const views = new Map<string, KindView>();
    for (const id of key === '' ? [] : key.split('|')) {
      const [kind, scope, range] = id.split(':');
      views.set(
        id,
        buildView(kind, feeds, {
          t,
          now,
          activeCharacterId,
          scopeAll: scope === '1',
          range: Number(range) as WidgetRange,
          notTrainingAlert,
        })
      );
    }
    return views;
  }, [key, feeds, now, t, activeCharacterId, notTrainingAlert]);
}

/** The view for one widget. */
export function useWidgetView(kind: string, scopeAll: boolean, range?: WidgetRange): KindView {
  const requests = useMemo(() => [{ kind, scopeAll, range }], [kind, scopeAll, range]);
  const views = useKindViews(requests);
  return views.get(viewKey({ kind, scopeAll, range })) as KindView;
}
