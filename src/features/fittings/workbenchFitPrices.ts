/**
 * Each EVE Workbench fit's price at the pilot's Default Trade Hub — the same
 * synced hub the Fitting's Price section quotes (`PriceHubSelect.tsx`), so
 * picking another hub anywhere re-prices the rows.
 *
 * Priced from the item counts the out-of-date check already loaded
 * (`workbenchFitCurrency.ts`), so nothing parses an EFT twice, and through
 * `fitSellPrice` — the Price section's own arithmetic. It is today's sell
 * price at that hub, not the loss value zKillboard recorded when a fit died.
 *
 * One `getHubPrices` call per hull per hub, for every type across the hull's
 * fits (out-of-date ones too, so showing them fetches nothing). That call is
 * the per-hub cache: `market/prices.ts` keeps each station's prices for its
 * 15-minute TTL, so a tab switch or a hub switched back reads from it. If
 * prices can't load, every row simply has no price.
 */
import { useEffect, useMemo, useState } from 'react';
import { fitSellPrice, type FitSellPrice } from '@/engine/fittings/fitSellPrice';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPrices, type HubAggregate } from '@/market/prices';
import type { WorkbenchFitCheck } from './workbenchFitCurrency';

export interface WorkbenchFitPrices {
  /** The hub the prices are from. */
  hub: TradeHub;
  /** A fit's price; `undefined` while loading, or when nothing in it has a sell order. */
  priceFor: (id: string) => FitSellPrice | undefined;
  /** At least one fit has a price. */
  anyPriced: boolean;
  /**
   * This hub's prices are still on their way. False once they land or fail,
   * and while there is nothing to price (still checking, or no fit loaded).
   */
  loading: boolean;
}

const NO_PRICES: ReadonlyMap<number, HubAggregate> = new Map();

/** Prices for the checked fits at the Default Trade Hub. Pass `checks` stable (memoized). */
export function useWorkbenchFitPrices(
  checks: ReadonlyMap<string, WorkbenchFitCheck> | null
): WorkbenchFitPrices {
  const hubId = useMarketHub((state) => state.value);
  const hydrate = useMarketHub((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const typeIds = useMemo(() => {
    if (checks === null) return null;
    const ids = new Set<number>();
    for (const check of checks.values()) for (const [typeId] of check.items) ids.add(typeId);
    return [...ids].sort((a, b) => a - b);
  }, [checks]);

  const [loaded, setLoaded] = useState<{
    hub: TradeHub;
    typeIds: readonly number[];
    prices: ReadonlyMap<number, HubAggregate>;
  } | null>(null);
  useEffect(() => {
    if (typeIds === null || typeIds.length === 0) return;
    let cancelled = false;
    void getHubPrices(hub, typeIds)
      .catch(() => NO_PRICES)
      .then((prices) => {
        if (!cancelled) setLoaded({ hub, typeIds, prices });
      });
    return () => {
      cancelled = true;
    };
  }, [hub, typeIds]);
  // Held against what it was asked for, so another hub's prices never show under this one.
  const prices = loaded?.hub === hub && loaded.typeIds === typeIds ? loaded.prices : null;

  const byFit = useMemo(() => {
    const priced = new Map<string, FitSellPrice>();
    if (checks === null || prices === null) return priced;
    for (const [id, check] of checks) {
      const price = fitSellPrice(check.items, prices);
      if (price !== null) priced.set(id, price);
    }
    return priced;
  }, [checks, prices]);

  return {
    hub,
    priceFor: (id) => byFit.get(id),
    anyPriced: byFit.size > 0,
    loading: typeIds !== null && typeIds.length > 0 && prices === null,
  };
}
