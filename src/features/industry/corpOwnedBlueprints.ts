import { useEffect, useMemo, useState } from 'react';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { loadCorporationBlueprints } from '@/features/corp/blueprints';
import { useActiveCorporationId } from '@/features/corp/owner';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import { useActiveCharacter } from '@/stores/activeCharacter';

export interface CorpOwnedBlueprintsState {
  blueprints: readonly CharacterBlueprint[];
  available: boolean;
  incomplete: boolean;
}

const NO_BLUEPRINTS: readonly CharacterBlueprint[] = [];

const UNAVAILABLE: CorpOwnedBlueprintsState = {
  blueprints: [],
  available: false,
  incomplete: false,
};

interface TaggedResult {
  characterId: number;
  corporationId: number;
  blueprints: readonly CharacterBlueprint[];
  incomplete: boolean;
}

export function useCorpOwnedBlueprints(): CorpOwnedBlueprintsState {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const corporationId = useActiveCorporationId();
  const access = useCorpAccess();
  const canReadBlueprints = access.state === 'ready' && access.capabilities.canReadBlueprints;
  const [tagged, setTagged] = useState<TaggedResult | null>(null);

  const available = canReadBlueprints && activeCharacterId !== null && corporationId !== null;

  useEffect(() => {
    if (!available || activeCharacterId === null || corporationId === null) return;
    let cancelled = false;
    void loadCorporationBlueprints(activeCharacterId, corporationId).then(
      (loaded) => {
        if (!cancelled) {
          setTagged({
            characterId: activeCharacterId,
            corporationId,
            blueprints: loaded.cached?.data ?? [],
            incomplete: loaded.cached?.truncated ?? false,
          });
        }
      },
      () => {
        if (!cancelled) {
          setTagged({
            characterId: activeCharacterId,
            corporationId,
            blueprints: [],
            incomplete: false,
          });
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [available, activeCharacterId, corporationId]);

  const result =
    tagged !== null &&
    tagged.characterId === activeCharacterId &&
    tagged.corporationId === corporationId
      ? tagged
      : null;

  return useMemo(
    () =>
      available
        ? {
            blueprints: result?.blueprints ?? NO_BLUEPRINTS,
            available: true,
            incomplete: result?.incomplete ?? false,
          }
        : UNAVAILABLE,
    [available, result]
  );
}
