/**
 * The Items board's early reads, ahead of the full snapshot (issue #2921): the
 * index (so suggestions and the region list exist before any chunk has landed)
 * and, for a search that names a few item types, just those types' chunks.
 * Both are optimisations and report "nothing" when they cannot help, in which
 * case the board waits for the full snapshot as it always did.
 */
import { useEffect, useMemo, useState } from 'react';
import { isSyncConfigured } from '@/app/syncStatus';
import { onCacheRevalidated } from '@/esi/cache';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import {
  loadOfferIndex,
  loadOffersForTypes,
  readSpan,
  type OfferIndex,
} from '@/features/contractSearch/publicContractOfferIndex';

/** A search naming more chunk docs than this is cheaper to answer from the full download that is already running. R2 has no such download running (`loadPublicContractOffers`), so it has no cap. */
const MAX_EARLY_CHUNKS = 12;
/** Typing re-ranks the matching types on every keystroke; read once the box has settled. */
const SETTLE_MS = 150;

/**
 * The index, once read. `null` until then, and for good when none is
 * published. A stale cached index is served at once and refreshed behind it;
 * when that refresh lands the index is read again, because after a publish
 * every chunk's stamp disagrees with the stale one and every early read would
 * quietly fall back to the full download.
 */
export function useOfferIndex(characterId: number | null, enabled: boolean): OfferIndex | null {
  const [index, setIndex] = useState<OfferIndex | null>(null);
  useEffect(() => {
    if (!enabled || characterId === null || !isSyncConfigured()) return;
    let cancelled = false;
    const read = () => {
      void loadOfferIndex(characterId).then((loaded) => {
        if (!cancelled) setIndex((current) => (sameIndex(current, loaded) ? current : loaded));
      });
    };
    read();
    const unsubscribe = onCacheRevalidated(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [characterId, enabled]);
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
  characterId: number | null,
  enabled: boolean
): EarlyOffers {
  // With R2 the full snapshot is never downloaded, so a search that names no
  // type (a region or price filter alone) reads every listed type instead.
  const wanted = useMemo<ReadonlySet<number> | null>(
    () => typeIds ?? (index?.r2 ? new Set(index.types.keys()) : null),
    [typeIds, index]
  );
  const key = useMemo(() => {
    if (!enabled || index === null || wanted === null || wanted.size === 0) return null;
    if (!index.r2 && readSpan(index, wanted) > MAX_EARLY_CHUNKS) return null;
    const scope = typeIds === null ? 'all' : [...typeIds].sort((a, b) => a - b).join(',');
    return `${index.lastSyncedAt}:${scope}`;
  }, [enabled, index, wanted, typeIds]);

  const [answer, setAnswer] = useState<{
    key: string;
    rows: readonly PublicContractOfferRow[] | null;
  } | null>(null);

  useEffect(() => {
    if (key === null || index === null || wanted === null || characterId === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadOffersForTypes(index, wanted, characterId).then((rows) => {
        if (!cancelled) setAnswer({ key, rows });
      });
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `key` encodes index and typeIds; listing the objects would re-run on every identity change of an equal set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, characterId]);

  // An R2 index listing no type has nothing to read and nothing coming.
  if (enabled && index?.r2 && wanted?.size === 0) return NO_OFFERS;
  if (key === null) return NONE;
  if (answer?.key !== key) return NONE;
  return answer.rows === null && index?.r2 ? { rows: null, failed: true } : { rows: answer.rows };
}
