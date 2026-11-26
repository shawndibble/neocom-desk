import { fuelBays } from '@/engine/corp/fuelPlan';
import { loadCorporationAssets } from '@/features/corp/assets';
import { accountCorpReaders } from '@/features/corp/corpReadAccess';
import { eveReadAtMs } from '@/features/corp/corpRead';
import { useActiveCharacter } from '@/stores/activeCharacter';

export interface CorpFuelBays {
  bays: ReadonlyMap<number, number>;
  readAtMs: number | null;
}

export async function loadStructureFuelBays(): Promise<Map<number, CorpFuelBays>> {
  const readers = await accountCorpReaders(
    'canReadAssets',
    useActiveCharacter.getState().activeCharacterId ?? undefined
  );
  const settled = await Promise.allSettled(
    [...readers].map(async ([corporationId, characterId]) => {
      const { cached } = await loadCorporationAssets(characterId, corporationId);
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
