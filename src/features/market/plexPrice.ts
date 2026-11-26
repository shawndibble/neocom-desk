import { useCallback } from 'react';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import {
  loadGlobalMarketOverrides,
  loadOrderBookView,
  orderBookLocationFor,
} from '@/features/market/orderBookView';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export interface PlexQuote {
  price: number;
  fetchedAt: number;
}

export async function loadPlexQuote(): Promise<PlexQuote | null> {
  const globalMarkets = await loadGlobalMarketOverrides();
  const location = orderBookLocationFor('region', null, DEFAULT_TRADE_HUB, globalMarkets);
  const view = await loadOrderBookView(PLEX_TYPE_ID, location);
  if (view.status !== 'ready') return null;
  const price = view.sell[0]?.price;
  return price === undefined ? null : { price, fetchedAt: view.fetchedAt };
}

export async function loadPlexPrice(): Promise<number | null> {
  return (await loadPlexQuote())?.price ?? null;
}

export function usePlexPrice(enabled = true): number | null {
  const loader = useCallback(() => loadPlexPrice().catch(() => null), []);
  return useKeyedLoad('plex', loader, !enabled).data ?? null;
}
