import { useEffect, useMemo, useState } from 'react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import { useHubFor } from '@/features/market/hub';
import { idSetKey } from '@/lib/idSetKey';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPricesWithStatus, getRegionSellPrices } from '@/market/prices';

export interface ContractFlagPrices {
  sellFor: (row: PublicContractOfferRow) => number | null;
  hub: TradeHub;
}

type PriceMap = ReadonlyMap<number, number>;

const NONE: PriceMap = new Map();

const MAX_PRICED_TYPES = 100;

function cappedIds(ids: Iterable<number>): number[] {
  const distinct = [...new Set(ids)].sort((a, b) => a - b);
  return distinct.length > MAX_PRICED_TYPES ? [] : distinct;
}

interface Known {
  hubId: string;
  prices: PriceMap;
}

function merged(known: Known, hubId: string, fresh: PriceMap): Known {
  const base = known.hubId === hubId ? known.prices : NONE;
  return { hubId, prices: new Map([...base, ...fresh]) };
}

export function useContractFlagPrices(
  rows: readonly PublicContractOfferRow[],
  enabled: boolean
): ContractFlagPrices {
  const { hubId } = useHubFor('contracts');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const plainIds = useMemo(
    () =>
      enabled
        ? cappedIds(
            rows
              .filter((row) => !row.isBlueprintCopy && row.typeId !== PLEX_TYPE_ID)
              .map((row) => row.typeId)
          )
        : [],
    [rows, enabled]
  );
  const copyIds = useMemo(
    () =>
      enabled ? cappedIds(rows.filter((row) => row.isBlueprintCopy).map((row) => row.typeId)) : [],
    [rows, enabled]
  );
  const plainKey = idSetKey(plainIds);
  const copyKey = idSetKey(copyIds);

  const [plain, setPlain] = useState<Known>({ hubId: '', prices: NONE });
  const [originals, setOriginals] = useState<Known>({ hubId: '', prices: NONE });

  useEffect(() => {
    if (plainIds.length === 0) return;
    let cancelled = false;
    void getHubPricesWithStatus(hub, plainIds).then(
      ({ prices }) => {
        if (cancelled) return;
        const sells = new Map<number, number>();
        for (const [typeId, aggregate] of prices) {
          if (aggregate.sellMin !== null) sells.set(typeId, aggregate.sellMin);
        }
        setPlain((known) => merged(known, hub.id, sells));
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, plainKey]);

  useEffect(() => {
    if (copyIds.length === 0) return;
    let cancelled = false;
    void getRegionSellPrices(hub.regionId, copyIds).then(
      (prices) => {
        if (cancelled) return;
        const sells = new Map<number, number>();
        for (const [typeId, price] of prices) if (price !== null) sells.set(typeId, price);
        setOriginals((known) => merged(known, hub.id, sells));
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, copyKey]);

  return useMemo(() => {
    const plainNow = plain.hubId === hub.id ? plain.prices : NONE;
    const originalsNow = originals.hubId === hub.id ? originals.prices : NONE;
    return {
      hub,
      sellFor: (row) => (row.isBlueprintCopy ? originalsNow : plainNow).get(row.typeId) ?? null,
    };
  }, [hub, plain, originals]);
}
