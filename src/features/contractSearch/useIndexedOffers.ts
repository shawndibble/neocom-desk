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
  type OfferIndex,
} from '@/features/contractSearch/publicContractOfferIndex';

/** A search naming more chunk docs than this is cheaper to answer from the full download that is already running. */
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

function chunkSpan(index: OfferIndex, typeIds: ReadonlySet<number>): number {
  const chunks = new Set<number>();
  for (const typeId of typeIds) {
    const entry = index.types.get(typeId);
    if (!entry) continue;
    for (let chunk = entry.firstChunk; chunk <= entry.lastChunk; chunk += 1) chunks.add(chunk);
  }
  return chunks.size;
}

/** The searched types' offers, or `null` when none were read (not applicable, failed, or still pending). */
export type EarlyOffers = { rows: readonly PublicContractOfferRow[] | null };

const NONE: EarlyOffers = { rows: null };

export function useEarlyOffers(
  index: OfferIndex | null,
  typeIds: ReadonlySet<number> | null,
  characterId: number | null,
  enabled: boolean
): EarlyOffers {
  const key = useMemo(() => {
    if (!enabled || index === null || typeIds === null || typeIds.size === 0) return null;
    if (chunkSpan(index, typeIds) > MAX_EARLY_CHUNKS) return null;
    return `${index.lastSyncedAt}:${[...typeIds].sort((a, b) => a - b).join(',')}`;
  }, [enabled, index, typeIds]);

  const [answer, setAnswer] = useState<{
    key: string;
    rows: readonly PublicContractOfferRow[] | null;
  } | null>(null);

  useEffect(() => {
    if (key === null || index === null || typeIds === null || characterId === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadOffersForTypes(index, typeIds, characterId).then((rows) => {
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

  if (key === null) return NONE;
  if (answer?.key !== key) return NONE;
  return { rows: answer.rows };
}
