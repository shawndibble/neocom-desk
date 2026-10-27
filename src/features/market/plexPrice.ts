/**
 * ISK per PLEX, for pricing a public contract that asks for PLEX in return
 * (`requestedPlex`). PLEX trades only on its own global market region
 * (`globalMarkets.json`), never at a Trade Hub station, so this goes through
 * the Order Book's global-market override rather than `getHubPrices` — which
 * would find no PLEX orders at Jita and price it at nothing.
 *
 * The cheapest sell order: what a buyer pays to get the PLEX the contract
 * wants. `null` when the book fails or is empty, which the price engine reads
 * as "PLEX-asking rows are unpriced", not as free PLEX.
 */
import { useEffect, useState } from 'react';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import {
  loadGlobalMarketOverrides,
  loadOrderBookView,
  orderBookLocationFor,
} from '@/features/market/orderBookView';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

export interface PlexQuote {
  price: number;
  /** When the order book was read, ms since the epoch. */
  fetchedAt: number;
}

/** `loadPlexPrice` with the age of the book behind it, for a view that shows its Data Age. */
export async function loadPlexQuote(): Promise<PlexQuote | null> {
  const globalMarkets = await loadGlobalMarketOverrides();
  // Region mode: Hub mode would narrow PLEX's global book to the hub station
  // and find nothing. The chosen region is ignored — the override wins.
  const location = orderBookLocationFor('region', null, DEFAULT_TRADE_HUB, globalMarkets);
  const view = await loadOrderBookView(PLEX_TYPE_ID, location);
  if (view.status !== 'ready') return null;
  const price = view.sell[0]?.price;
  return price === undefined ? null : { price, fetchedAt: view.fetchedAt };
}

export async function loadPlexPrice(): Promise<number | null> {
  return (await loadPlexQuote())?.price ?? null;
}

/** `loadPlexPrice` as state: `null` until (and unless) a price arrives. */
export function usePlexPrice(enabled = true): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadPlexPrice()
      .catch(() => null)
      .then((next) => {
        if (!cancelled) setPrice(next);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return price;
}
