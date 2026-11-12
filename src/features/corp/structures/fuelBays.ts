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

export interface CorpFuelBays {
  /** Blocks by structure id; a structure with an empty bay has no entry. */
  bays: ReadonlyMap<number, number>;
  /** When the assets were read, for pairing with the structures' expiry. */
  readAt: Date;
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
        ? ([corporationId, { bays: fuelBays(cached.data), readAt: cached.fetchedAt }] as const)
        : null;
    })
  );
  return new Map(
    settled.flatMap((outcome) =>
      outcome.status === 'fulfilled' && outcome.value ? [outcome.value] : []
    )
  );
}
