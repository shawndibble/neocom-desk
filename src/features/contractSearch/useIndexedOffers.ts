import { idSetKey } from '@/lib/idSetKey';
import { useEffect, useMemo, useState } from 'react';
import { onCacheRevalidated } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  loadOfferIndex,
  loadOffersForTypes,
  type OfferIndex,
} from '@/features/contractSearch/publicContractOfferIndex';

const SETTLE_MS = 150;

export function useOfferIndex(enabled: boolean): OfferIndex | null {
  const [index, setIndex] = useState<OfferIndex | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = () => {
      void loadOfferIndex().then((loaded) => {
        if (!cancelled) setIndex((current) => (sameIndex(current, loaded) ? current : loaded));
      });
    };
    read();
    const unsubscribe = onCacheRevalidated(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled]);
  return index;
}

function sameIndex(a: OfferIndex | null, b: OfferIndex | null): boolean {
  return a?.lastSyncedAt === b?.lastSyncedAt;
}

export type EarlyOffers = { rows: readonly PublicContractOfferRow[] | null; failed?: true };

const NONE: EarlyOffers = { rows: null };
const NO_OFFERS: EarlyOffers = { rows: [] };

export function useEarlyOffers(
  index: OfferIndex | null,
  typeIds: ReadonlySet<number> | null,
  enabled: boolean
): EarlyOffers {
  const wantedCount = typeIds?.size ?? index?.types.size ?? 0;
  const key = useMemo(() => {
    if (!enabled || index === null || wantedCount === 0) return null;
    const scope = typeIds === null ? 'all' : idSetKey(typeIds);
    return `${index.lastSyncedAt}:${scope}`;
  }, [enabled, index, wantedCount, typeIds]);

  const [answer, setAnswer] = useState<{
    key: string;
    rows: readonly PublicContractOfferRow[] | null;
  } | null>(null);

  useEffect(() => {
    if (key === null || index === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadOffersForTypes(index, typeIds).then((rows) => {
        if (!cancelled) setAnswer({ key, rows });
      });
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` encodes index and typeIds; listing the objects would re-run on every identity change of an equal set
  }, [key]);

  if (enabled && index && wantedCount === 0) return NO_OFFERS;
  if (key === null) return NONE;
  if (answer?.key !== key) return NONE;
  return answer.rows === null ? { rows: null, failed: true } : { rows: answer.rows };
}
