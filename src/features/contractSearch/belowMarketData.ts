import { useEffect, useMemo, useState } from 'react';
import {
  belowMarketContracts,
  belowMarketPriceTypeIds,
  type BelowMarketContract,
  type BelowMarketPricing,
} from '@/engine/contracts/belowMarket';
import { PLEX_TYPE_ID, type PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { useHubFor } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import type { PriceSide } from '@/engine/miningTax/priceBasis';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { getHubPricesWithStatus } from '@/market/prices';

interface BelowMarketPricingRead {
  pricing: BelowMarketPricing;
  hub: TradeHub;
  unreachable: boolean;
}

export const DEFAULT_BELOW_MARKET_SIDE: PriceSide = 'sell';

export const useBelowMarketSide = createLocalSetting<PriceSide>({
  key: 'belowMarketSide',
  defaultValue: DEFAULT_BELOW_MARKET_SIDE,
  parse: (raw) => (raw === 'buy' || raw === 'sell' ? raw : null),
});

async function loadBelowMarketPricing(
  rows: readonly PublicContractOfferRow[],
  plexPrice: number | null,
  side: PriceSide,
  hub: TradeHub
): Promise<BelowMarketPricingRead> {
  const { isAbyssalType } = await loadMutaplasmidLookup();
  const typeIds = belowMarketPriceTypeIds(rows, plexPrice, isAbyssalType);
  const { prices: books, unreachable } = await getHubPricesWithStatus(hub, typeIds);
  const prices = new Map<number, number | null>();
  for (const [typeId, aggregate] of books) {
    prices.set(typeId, side === 'buy' ? aggregate.buyMax : aggregate.sellMin);
  }
  if (side === 'sell' && plexPrice !== null) prices.set(PLEX_TYPE_ID, plexPrice);
  return { pricing: { prices, plexPrice, isAbyssalType }, hub, unreachable };
}

export type BelowMarketState =
  | { status: 'idle' }
  | { status: 'pricing' }
  | { status: 'failed' }
  | {
      status: 'ready';
      contracts: readonly BelowMarketContract[];
      hub: TradeHub;
      side: PriceSide;
      unreachable: boolean;
      current: boolean;
    };

const IDLE: BelowMarketState = { status: 'idle' };
const PRICING: BelowMarketState = { status: 'pricing' };
const FAILED: BelowMarketState = { status: 'failed' };

interface PricedRows {
  rows: readonly PublicContractOfferRow[];
  plexPrice: number | null;
  side: PriceSide;
  hub: TradeHub;
  result: BelowMarketPricingRead;
}

export function useBelowMarket(
  rows: readonly PublicContractOfferRow[],
  enabled: boolean,
  plexPrice: number | null,
  side: PriceSide,
  includeOther: boolean
): BelowMarketState {
  const [read, setRead] = useState<PricedRows | 'failed' | null>(null);
  const { hubId, hydrated: hubHydrated } = useHubFor('contracts');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  useEffect(() => {
    if (!enabled || rows.length === 0 || !hubHydrated) return;
    let cancelled = false;
    void loadBelowMarketPricing(rows, plexPrice, side, hub).then(
      (result) => {
        if (!cancelled) setRead({ rows, plexPrice, side, hub, result });
      },
      () => {
        if (!cancelled) setRead((last) => (last !== null && last !== 'failed' ? last : 'failed'));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, rows, plexPrice, side, hub, hubHydrated]);

  const contracts = useMemo(
    () =>
      read !== null && read !== 'failed'
        ? belowMarketContracts(read.rows, read.result.pricing, { includeOther })
        : null,
    [read, includeOther]
  );
  const current =
    read !== null &&
    read !== 'failed' &&
    read.rows === rows &&
    read.plexPrice === plexPrice &&
    read.side === side &&
    read.hub === hub;

  return useMemo<BelowMarketState>(() => {
    if (!enabled) return IDLE;
    if (rows.length === 0 || read === 'failed') return FAILED;
    if (read === null || contracts === null) return PRICING;
    return {
      status: 'ready',
      contracts,
      hub: read.result.hub,
      side: read.side,
      unreachable: read.result.unreachable,
      current,
    };
  }, [enabled, rows.length, read, contracts, current]);
}
