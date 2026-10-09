/**
 * ISK per unit for the ores a Survey shows, from the pilot's default Trade
 * Hub (Jita unless they chose another): the highest buy order of the ore's
 * Compressed form where it has one, as the Moon Mining Tax ledger prices ore
 * (`features/miningTax/pricing.ts`). Works for a visitor with no session too:
 * the hub setting falls back to Jita and Fuzzwork needs no login.
 */
import { useEffect, useMemo, useState } from 'react';
import { getHubPrices } from '@/market/prices';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { loadCompressedOreTypeIds, loadOreAndIceTypeIds, loadTypes } from '@/sde/loadSde';
import { oreFormTypeId } from '@/engine/miningTax/oreForm';
import { useMarketHub } from '@/features/market/hub';
import { readCompressedOre } from '@/features/miningTax/oreForm';

export interface OrePrices {
  /** Ore name as the scanner prints it -> ISK per unit; empty until loaded or when unreachable. */
  prices: ReadonlyMap<string, number>;
  hub: TradeHub;
  compressed: boolean;
}

export function useOrePrices(oreNames: readonly string[]): OrePrices {
  const hubId = useMarketHub((s) => s.value);
  const hydrated = useMarketHub((s) => s.hydrated);
  const hydrate = useMarketHub((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  const hub = (hydrated ? getTradeHub(hubId) : undefined) ?? DEFAULT_TRADE_HUB;
  const key = [...new Set(oreNames)].sort().join('\n');
  const [loaded, setLoaded] = useState<{
    key: string;
    hubId: string;
    prices: ReadonlyMap<string, number>;
    compressed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!hydrated || key === '') return;
    let cancelled = false;
    void (async () => {
      try {
        const [types, oreIds, compressedByRaw, compressed] = await Promise.all([
          loadTypes(),
          loadOreAndIceTypeIds(),
          loadCompressedOreTypeIds(),
          readCompressedOre(),
        ]);
        const wanted = new Set(key.split('\n'));
        const rawByName = new Map<string, number>();
        for (const id of oreIds) {
          const name = types[String(id)]?.name;
          if (name !== undefined && wanted.has(name)) rawByName.set(name, id);
        }
        const priced = new Map(
          [...rawByName].map(([n, id]) => [n, oreFormTypeId(id, compressedByRaw, compressed)])
        );
        const aggregates = await getHubPrices(hub, [...new Set(priced.values())]);
        const prices = new Map<string, number>();
        for (const [name, typeId] of priced) {
          const buy = aggregates.get(typeId)?.buyMax;
          if (buy) prices.set(name, buy);
        }
        if (!cancelled) setLoaded({ key, hubId: hub.id, prices, compressed });
      } catch {
        if (!cancelled) setLoaded({ key, hubId: hub.id, prices: new Map(), compressed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, key, hub]);

  return useMemo(() => {
    const current = loaded?.key === key && loaded.hubId === hub.id ? loaded : null;
    return { prices: current?.prices ?? new Map(), hub, compressed: current?.compressed ?? true };
  }, [loaded, key, hub]);
}
