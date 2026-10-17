/**
 * The prices behind Contracts › Item search's Below market view (#3989): the
 * default Trade Hub's best buy for every market line of a candidate contract,
 * this Character's sales tax, and the abyssal lookup. The valuation itself is
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
import { salesTaxPct } from '@/engine/industry/fees';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { loadAccountingLevel } from '@/features/pi/salesTaxRate';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPricesWithStatus } from '@/market/prices';

interface BelowMarketPricingRead {
  pricing: BelowMarketPricing;
  hub: TradeHub;
  /** Fuzzwork did not answer for some types: those lines count as no market. */
  unreachable: boolean;
}

/** Accounting level, or 0 — tax priced without skills reads high, never low. */
async function accountingLevel(characterId: number | null): Promise<number> {
  if (characterId === null) return 0;
  return (await loadAccountingLevel(characterId, Date.now()).catch(() => null)) ?? 0;
}

async function loadBelowMarketPricing(
  rows: readonly PublicContractOfferRow[],
  characterId: number | null,
  plexPrice: number | null
): Promise<BelowMarketPricingRead> {
  const [lookup, level] = await Promise.all([
    loadMutaplasmidLookup(),
    accountingLevel(characterId),
    useMarketHub.getState().hydrate(),
  ]);
  const hub = getTradeHub(useMarketHub.getState().value) ?? DEFAULT_TRADE_HUB;
  const { isAbyssalType } = lookup;
  const typeIds = belowMarketPriceTypeIds(rows, plexPrice, isAbyssalType);
  const { prices, unreachable } = await getHubPricesWithStatus(hub, typeIds);
  const bestBuy = new Map<number, number | null>();
  for (const [typeId, aggregate] of prices) bestBuy.set(typeId, aggregate.buyMax);
  return {
    pricing: { bestBuy, salesTaxPct: salesTaxPct(level), plexPrice, isAbyssalType },
    hub,
    unreachable,
  };
}

export type BelowMarketState =
  | { status: 'idle' }
  | { status: 'pricing' }
  | { status: 'failed' }
  | {
      status: 'ready';
      contracts: readonly BelowMarketContract[];
      hub: TradeHub;
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
  characterId: number | null,
  plexPrice: number | null
): BelowMarketState {
  const [read, setRead] = useState<PricedRows | 'failed' | null>(null);

  useEffect(() => {
    if (!enabled || rows.length === 0) return;
    let cancelled = false;
    void loadBelowMarketPricing(rows, characterId, plexPrice).then(
      (result) => {
        if (!cancelled) setRead({ rows, plexPrice, result });
      },
      () => {
        if (!cancelled) setRead((last) => (last !== null && last !== 'failed' ? last : 'failed'));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, rows, characterId, plexPrice]);

  // Keyed on the read alone: newer rows arriving must not re-run the valuation over the old ones.
  const contracts = useMemo(
    () =>
      read !== null && read !== 'failed'
        ? belowMarketContracts(read.rows, read.result.pricing)
        : null,
    [read]
  );
  const current =
    read !== null && read !== 'failed' && read.rows === rows && read.plexPrice === plexPrice;

  return useMemo<BelowMarketState>(() => {
    if (!enabled) return IDLE;
    // Enabled with no rows: the snapshot read came back empty-handed.
    if (rows.length === 0 || read === 'failed') return FAILED;
    if (read === null || contracts === null) return PRICING;
    return {
      status: 'ready',
      contracts,
      hub: read.result.hub,
      unreachable: read.result.unreachable,
      current,
    };
  }, [enabled, rows.length, read, contracts, current]);
}
