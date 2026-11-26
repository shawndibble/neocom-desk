import { useEffect, useMemo, useState } from 'react';
import { useResolvedCharacterFilter } from '@/features/character/characterFilterValue';
import type { CharacterFilterValue } from '@/features/character/characterFilterValue';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadCharacterBlueprints } from './data';
import { buildOpportunityCandidates } from './opportunities';

interface OpportunityCandidatesInput {
  catalog: BlueprintCatalog;
  activeCharacterId: number;
  characterFilter: CharacterFilterValue;
  characterCandidates: readonly { characterId: number }[];
  characterNames: ReadonlyMap<number, string>;
  onDataAgeChange?: (date: Date | null) => void;
}

export function useOpportunityCandidates({
  catalog,
  activeCharacterId,
  characterFilter,
  characterCandidates,
  characterNames,
  onDataAgeChange,
}: OpportunityCandidatesInput) {
  const resolvedCharacterIds = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const nextCharacterIds =
    resolvedCharacterIds === 'all'
      ? characterCandidates.map((c) => c.characterId)
      : [...resolvedCharacterIds];
  const characterIdsKey = nextCharacterIds.join(',');
  const characterIds = useMemo(
    () => (characterIdsKey === '' ? [] : characterIdsKey.split(',').map(Number)),
    [characterIdsKey]
  );

  const [blueprintsState, setBlueprintsState] = useState<{
    ownedByCharacter: Map<number, CharacterBlueprint[]>;
    loading: boolean;
    oldestFetchedAt: Date | null;
    failedCount: number;
    cachedAt: number | null;
  }>({
    ownedByCharacter: new Map(),
    loading: true,
    oldestFetchedAt: null,
    failedCount: 0,
    cachedAt: null,
  });
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (characterIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlueprintsState({
        ownedByCharacter: new Map(),
        loading: false,
        oldestFetchedAt: null,
        failedCount: 0,
        cachedAt: null,
      });
      return;
    }
    let cancelled = false;
    setBlueprintsState((prev) => ({ ...prev, loading: true }));
    void Promise.all(characterIds.map((id) => loadCharacterBlueprints(id))).then((results) => {
      if (cancelled) return;
      const map = new Map<number, CharacterBlueprint[]>();
      let oldestFetchedAt: Date | null = null;
      let failedCount = 0;
      let cachedAt: number | null = null;
      results.forEach((result, index) => {
        map.set(characterIds[index]!, result.cached?.data ?? []);
        if (result.cached === null) failedCount += 1;
        else if (result.cached.fromCache) {
          const at = result.cached.fetchedAt.getTime();
          if (cachedAt === null || at < cachedAt) cachedAt = at;
        }
        const fetchedAt = result.cached?.fetchedAt;
        if (fetchedAt && (!oldestFetchedAt || fetchedAt < oldestFetchedAt))
          oldestFetchedAt = fetchedAt;
      });
      setBlueprintsState({
        ownedByCharacter: map,
        loading: false,
        oldestFetchedAt,
        failedCount,
        cachedAt,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [characterIds, retryTick]);
  const {
    ownedByCharacter,
    loading: blueprintsLoading,
    oldestFetchedAt,
    failedCount,
    cachedAt,
  } = blueprintsState;
  const allBlueprintsFailed = characterIds.length > 0 && failedCount === characterIds.length;

  const oldestFetchedMs = oldestFetchedAt?.getTime() ?? null;
  useEffect(() => {
    onDataAgeChange?.(oldestFetchedMs === null ? null : new Date(oldestFetchedMs));
    return () => onDataAgeChange?.(null);
  }, [oldestFetchedMs, onDataAgeChange]);

  const candidates = useMemo(
    () => buildOpportunityCandidates(ownedByCharacter, characterNames, catalog),
    [ownedByCharacter, characterNames, catalog]
  );

  return {
    characterIds,
    characterIdsKey,
    candidates,
    ownedByCharacter,
    blueprintsLoading,
    failedCount,
    cachedAt,
    allBlueprintsFailed,
    retry: () => setRetryTick((n) => n + 1),
  };
}
