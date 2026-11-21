/**
 * Fuel blocks in every structure's fuel bay, for the Structures page's fuel
 * plan (issue #6093). Read per corporation from its assets, which EVE opens
 * only to a Director: a corporation no Character can read that way — or whose
 * read failed — has no entry, and its structures fall back to time left.
 */
import { fuelBays } from '@/engine/corp/fuelPlan';
import { loadCorporationAssets } from '@/features/corp/assets';
import { accountCorpReaders } from '@/features/corp/corpReadAccess';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { HOUR_MS } from '@/lib/age';

/** How long ESI caches a corporation's structures and its assets alike. */
const CORP_READ_CACHE_MS = HOUR_MS;

/**
 * When EVE read a corporation's structures or assets, from the read's ESI
 * `Expires`: each is cached for an hour from that read. Null when unknown —
 * a row stored before `Expires` was kept, or a read that sent none.
 */
export function eveReadAtMs(expiresAt: Date | undefined): number | null {
  return expiresAt ? expiresAt.getTime() - CORP_READ_CACHE_MS : null;
}

export interface CorpFuelBays {
  /** Blocks by structure id; a structure with an empty bay has no entry. */
  bays: ReadonlyMap<number, number>;
  /** When EVE read the assets (`eveReadAtMs`), for pairing with the structures' expiry. */
  readAtMs: number | null;
}

/** Fuel bays by corporation id, for each corporation whose assets could be read. */
export async function loadStructureFuelBays(): Promise<Map<number, CorpFuelBays>> {
  const readers = await accountCorpReaders(
    'canReadAssets',
    useActiveCharacter.getState().activeCharacterId ?? undefined
  );
  const settled = await Promise.allSettled(
    [...readers].map(async ([corporationId, characterId]) => {
      const { cached } = await loadCorporationAssets(characterId, corporationId);
      // A truncated read may be missing a bay: no number beats a short one.
      return cached && !cached.truncated
        ? ([
            corporationId,
            { bays: fuelBays(cached.data), readAtMs: eveReadAtMs(cached.expiresAt) },
          ] as const)
        : null;
    })
  );
  return new Map(
    settled.flatMap((outcome) =>
      outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : []
    )
  );
}
