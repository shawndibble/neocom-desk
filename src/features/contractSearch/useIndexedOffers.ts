import { idSetKey } from '@/lib/idSetKey';
/**
 * The Items board's reads through the R2 offer index (issue #2921, ADR 0019):
 * the index (so suggestions and the region list exist before any offers have
 * landed) and the offers of just the item types a search names. R2 is the only
 * store (issue #4270), so a failed read is reported as such rather than
 * waiting on a full snapshot that is never coming.
 */
import { useEffect, useMemo, useState } from 'react';
import { onCacheRevalidated } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  loadOfferIndex,
  loadOffersForTypes,
  type OfferIndex,
} from '@/features/contractSearch/publicContractOfferIndex';

/** Typing re-ranks the matching types on every keystroke; read once the box has settled. */
const SETTLE_MS = 150;

/**
 * The index, once read. `null` until then, and for good when none is
 * published. A stale cached index is served at once and refreshed behind it;
 * when that refresh lands the index is read again, so a search reads the
 * objects the newest publish names.
 */
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

/** Same publish, same index: keeps the identity stable so nothing downstream recomputes. */
function sameIndex(a: OfferIndex | null, b: OfferIndex | null): boolean {
  return a?.lastSyncedAt === b?.lastSyncedAt;
}

/**
 * The searched types' offers, or `null` when none were read (not applicable,
 * failed, or still pending). `failed` is set only when a read was attempted and
 * came back empty-handed: with R2 no full snapshot is coming to replace it.
 */
export type EarlyOffers = { rows: readonly PublicContractOfferRow[] | null; failed?: true };

const NONE: EarlyOffers = { rows: null };
const NO_OFFERS: EarlyOffers = { rows: [] };

export function useEarlyOffers(
  index: OfferIndex | null,
  typeIds: ReadonlySet<number> | null,
  enabled: boolean
): EarlyOffers {
  // A search that names no type (a region or price filter alone, or Below
  // market) reads every offer, from the index's bundle shards.
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

  // An R2 index listing no type has nothing to read and nothing coming.
  if (enabled && index && wantedCount === 0) return NO_OFFERS;
  if (key === null) return NONE;
  if (answer?.key !== key) return NONE;
  return answer.rows === null ? { rows: null, failed: true } : { rows: answer.rows };
}
