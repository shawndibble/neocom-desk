/**
 * The hub prices the Items board's row flags (#4773) are held against: the
 * Trade Hub's best sell for each plain item on screen, and the lowest sell in
 * the hub's region for each blueprint copy's original. No new request path:
 * both go through `market/prices`, which the Below market view already shares
 * and caches on the hub TTL, in one batched call per kind.
 *
 * A type with no price yet (still reading, unreachable, or nothing listed) is
 * simply absent, and `contractFlagFor` stays silent for it.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import { useMarketHub } from '@/features/market/hub';
import { idSetKey } from '@/lib/idSetKey';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { getHubPricesWithStatus, getRegionSellPrices } from '@/market/prices';

export interface ContractFlagPrices {
  /** The price a row is held against, or `null` while it has none. */
  sellFor: (row: PublicContractOfferRow) => number | null;
  hub: TradeHub;
}

type PriceMap = ReadonlyMap<number, number>;

const NONE: PriceMap = new Map();

/**
 * Past this many distinct types the board is a wide browse (a region or price
 * filter with no item), where one price call for thousands of types is not
 * worth a marker: flags stay silent rather than lag.
 */
const MAX_PRICED_TYPES = 100;

function cappedIds(ids: Iterable<number>): number[] {
  const distinct = [...new Set(ids)].sort((a, b) => a - b);
  return distinct.length > MAX_PRICED_TYPES ? [] : distinct;
}

export function useContractFlagPrices(
  rows: readonly PublicContractOfferRow[],
  enabled: boolean
): ContractFlagPrices {
  const hubId = useMarketHub((state) => state.value);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  // PLEX trades only on its own market, so no hub lists it.
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

  const [plain, setPlain] = useState<{ key: string; prices: PriceMap }>({ key: '', prices: NONE });
  const [originals, setOriginals] = useState<{ key: string; prices: PriceMap }>({
    key: '',
    prices: NONE,
  });

  useEffect(() => {
    if (plainIds.length === 0) return;
    let cancelled = false;
    const key = `${hub.id}:${plainKey}`;
    void getHubPricesWithStatus(hub, plainIds).then(
      ({ prices }) => {
        if (cancelled) return;
        const sells = new Map<number, number>();
        for (const [typeId, aggregate] of prices) {
          if (aggregate.sellMin !== null) sells.set(typeId, aggregate.sellMin);
        }
        setPlain({ key, prices: sells });
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
    // `plainIds` is read through its key: a re-filter that keeps the same types re-prices nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, plainKey]);

  useEffect(() => {
    if (copyIds.length === 0) return;
    let cancelled = false;
    const key = `${hub.id}:${copyKey}`;
    void getRegionSellPrices(hub.regionId, copyIds).then(
      (prices) => {
        if (cancelled) return;
        const sells = new Map<number, number>();
        for (const [typeId, price] of prices) if (price !== null) sells.set(typeId, price);
        setOriginals({ key, prices: sells });
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, copyKey]);

  const plainCurrent = plain.key === `${hub.id}:${plainKey}` ? plain.prices : NONE;
  const originalsCurrent = originals.key === `${hub.id}:${copyKey}` ? originals.prices : NONE;

  return useMemo(
    () => ({
      hub,
      sellFor: (row) =>
        (row.isBlueprintCopy ? originalsCurrent : plainCurrent).get(row.typeId) ?? null,
    }),
    [hub, plainCurrent, originalsCurrent]
  );
}
