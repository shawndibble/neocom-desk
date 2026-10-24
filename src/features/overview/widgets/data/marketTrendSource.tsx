/**
 * The Market Trend feed: a hook source, because what it reads depends on the
 * widgets rather than on the kind. Each Market Trend widget names its own
 * items and Trade Hubs (or follows the Quickbar and the Market hub), so this
 * reads the layout, works out the lines every widget needs, and reads each
 * distinct line once (`loadMarketTrend`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useMarketHub } from '@/features/market/hub';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOverviewLayout } from '../layoutStore';
import {
  loadMarketTrend,
  type MarketTrendFeed,
  type MarketTrendRequest,
} from './marketTrendLoader';
import { useFeedStore } from './feedStoreContext';
import { useOverviewRefresh } from './refreshContext';

interface Loaded {
  data: MarketTrendFeed | null;
  error: boolean;
  /** The request (and refresh) the last answer, good or failed, was for. */
  answered: string | null;
}

export function MarketTrendSource() {
  const store = useFeedStore();
  const { epoch } = useOverviewRefresh();
  const layout = useOverviewLayout((state) => state.value);
  const defaultHubId = useMarketHub((state) => state.value);
  const characterId = useActiveCharacter((state) => state.activeCharacterId);
  const hydrated = useHydratedStore(useOverviewLayout, useMarketHub);
  // Undefined only while the read is in flight, so a missing record (an empty Quickbar) still counts as loaded.
  const bar = useLiveQuery(
    async () => ({
      items:
        characterId === null ? [] : ((await db.quickbars.get(String(characterId)))?.items ?? []),
    }),
    [characterId]
  );

  const request = useMemo<MarketTrendRequest | null>(() => {
    if (!hydrated || bar === undefined) return null;
    const quickbar = bar.items.map(({ typeId, name }) => ({ typeId, name }));
    const sets = (layout?.widgets ?? [])
      .filter((widget) => widget.kind === 'marketTrend')
      .map((widget) => ({
        typeIds: widget.trendItems ?? quickbar.map((item) => item.typeId),
        hubIds: widget.trendHubs ?? [defaultHubId],
      }));
    return { quickbar, defaultHubId, sets };
  }, [hydrated, bar, layout, defaultHubId]);
  // Only a change in what is asked reloads; an unrelated layout edit (a resize) keeps the same key.
  const signature = request === null ? null : JSON.stringify(request);

  const asked = signature === null ? null : `${epoch}:${signature}`;
  const [state, setState] = useState<Loaded>({ data: null, error: false, answered: null });
  useEffect(() => {
    if (signature === null || asked === null) return;
    let live = true;
    loadMarketTrend(JSON.parse(signature) as MarketTrendRequest).then(
      (data) => live && setState({ data, error: false, answered: asked }),
      // The last good read stays behind a failed refresh.
      () => live && setState((prev) => ({ ...prev, error: true, answered: asked }))
    );
    return () => {
      live = false;
    };
  }, [signature, asked]);

  const feed = useMemo(
    () => ({ data: state.data, error: state.error, loading: state.answered !== asked }),
    [state, asked]
  );
  useEffect(() => {
    store.set('marketTrend', feed);
  }, [store, feed]);
  useEffect(() => () => store.clear('marketTrend'), [store]);
  return null;
}
