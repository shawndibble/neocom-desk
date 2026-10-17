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
import { SKILL_IDS } from '@/engine/industry/types';
import { loadMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { useMarketHub } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPricesWithStatus } from '@/market/prices';

export interface BelowMarketPricingRead {
  pricing: BelowMarketPricing;
  hub: TradeHub;
  /** Fuzzwork did not answer for some types: those lines count as no market. */
  unreachable: boolean;
}

/** Accounting level, or 0 — tax priced without skills reads high, never low. */
async function accountingLevel(characterId: number | null): Promise<number> {
  if (characterId === null) return 0;
  const modifiers = await loadCharacterModifiers(characterId, Date.now()).catch(() => null);
  return modifiers?.skills[SKILL_IDS.accounting] ?? 0;
}

export async function loadBelowMarketPricing(
  rows: readonly PublicContractOfferRow[],
  characterId: number | null,
  plexPrice: number | null
): Promise<BelowMarketPricingRead> {
  await useMarketHub.getState().hydrate();
  const hub = getTradeHub(useMarketHub.getState().value) ?? DEFAULT_TRADE_HUB;
  const [lookup, level] = await Promise.all([
    loadMutaplasmidLookup(),
    accountingLevel(characterId),
  ]);
  const isAbyssalType = (typeId: number) => lookup.isAbyssalType(typeId);
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
    };

const IDLE: BelowMarketState = { status: 'idle' };

/**
 * The Below market contracts of `rows`, which must be the whole snapshot.
 * Re-priced whenever the rows or the PLEX price change; the hub price cache
 * makes a re-read after a revalidation cheap.
 */
export function useBelowMarket(
  rows: readonly PublicContractOfferRow[],
  enabled: boolean,
  characterId: number | null,
  plexPrice: number | null
): BelowMarketState {
  const [read, setRead] = useState<{
    rows: readonly PublicContractOfferRow[];
    plexPrice: number | null;
    result: BelowMarketPricingRead | null;
  } | null>(null);

  useEffect(() => {
    if (!enabled || rows.length === 0) return;
    let cancelled = false;
    void loadBelowMarketPricing(rows, characterId, plexPrice).then(
      (result) => {
        if (!cancelled) setRead({ rows, plexPrice, result });
      },
      () => {
        if (!cancelled) setRead({ rows, plexPrice, result: null });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, rows, characterId, plexPrice]);

  const contracts = useMemo(
    () => (read?.result ? belowMarketContracts(read.rows, read.result.pricing) : null),
    [read]
  );

  if (!enabled) return IDLE;
  // A re-price after a revalidation keeps the last answer on screen until it lands.
  if (read === null) return { status: 'pricing' };
  if (read.result === null || contracts === null) return { status: 'failed' };
  return {
    status: 'ready',
    contracts,
    hub: read.result.hub,
    unreachable: read.result.unreachable,
  };
}
