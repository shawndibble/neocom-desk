/**
 * The prices behind Contracts › Item search's Below market view (#3989): the
 * default Trade Hub's price, on the chosen side of the book, for every market
 * line of a candidate contract, and the abyssal lookup. The valuation itself is
 * the pure `engine/contracts/belowMarket.ts`.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  belowMarketContracts,
  belowMarketPriceTypeIds,
  type BelowMarketContract,
  type BelowMarketPricing,
} from '@/engine/contracts/belowMarket';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import type { PriceSide } from '@/engine/miningTax/priceBasis';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { getHubPricesWithStatus } from '@/market/prices';

interface BelowMarketPricingRead {
  pricing: BelowMarketPricing;
  hub: TradeHub;
  /** Fuzzwork did not answer for some types: those lines count as no market. */
  unreachable: boolean;
}

/** Which side of the hub book values the market part; sell orders is what a pilot makes listing the loot. */
export const DEFAULT_BELOW_MARKET_SIDE: PriceSide = 'sell';

export const useBelowMarketSide = createLocalSetting<PriceSide>({
  key: 'belowMarketSide',
  defaultValue: DEFAULT_BELOW_MARKET_SIDE,
  parse: (raw) => (raw === 'buy' || raw === 'sell' ? raw : null),
});

async function loadBelowMarketPricing(
  rows: readonly PublicContractOfferRow[],
  plexPrice: number | null,
  side: PriceSide
): Promise<BelowMarketPricingRead> {
  const [lookup] = await Promise.all([loadMutaplasmidLookup(), useMarketHub.getState().hydrate()]);
  const hub = getTradeHub(useMarketHub.getState().value) ?? DEFAULT_TRADE_HUB;
  const { isAbyssalType } = lookup;
  const typeIds = belowMarketPriceTypeIds(rows, plexPrice, isAbyssalType);
  const { prices: books, unreachable } = await getHubPricesWithStatus(hub, typeIds);
  const prices = new Map<number, number | null>();
  for (const [typeId, aggregate] of books) {
    prices.set(typeId, side === 'buy' ? aggregate.buyMax : aggregate.sellMin);
  }
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
      /** The side of the book `contracts` are valued on. */
      side: PriceSide;
      unreachable: boolean;
      /** False while a re-price of newer rows is still running behind these contracts. */
      current: boolean;
    };

const IDLE: BelowMarketState = { status: 'idle' };
const PRICING: BelowMarketState = { status: 'pricing' };
const FAILED: BelowMarketState = { status: 'failed' };

interface PricedRows {
  rows: readonly PublicContractOfferRow[];
  plexPrice: number | null;
  side: PriceSide;
  result: BelowMarketPricingRead;
}

/**
 * The Below market contracts of `rows`, which must be the whole snapshot.
 * Re-priced whenever the rows or the PLEX price change; the last answer stays
 * on screen until the next lands, and through a failed re-price.
 */
export function useBelowMarket(
  rows: readonly PublicContractOfferRow[],
  enabled: boolean,
  plexPrice: number | null,
  side: PriceSide,
  includeOther: boolean
): BelowMarketState {
  const [read, setRead] = useState<PricedRows | 'failed' | null>(null);

  useEffect(() => {
    if (!enabled || rows.length === 0) return;
    let cancelled = false;
    void loadBelowMarketPricing(rows, plexPrice, side).then(
      (result) => {
        if (!cancelled) setRead({ rows, plexPrice, side, result });
      },
      () => {
        if (!cancelled) setRead((last) => (last !== null && last !== 'failed' ? last : 'failed'));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, rows, plexPrice, side]);

  // Keyed on the read alone: newer rows arriving must not re-run the valuation over the old ones.
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
    read.side === side;

  return useMemo<BelowMarketState>(() => {
    if (!enabled) return IDLE;
    // Enabled with no rows: the snapshot read came back empty-handed.
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
