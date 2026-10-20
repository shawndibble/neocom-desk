/**
 * Which blueprints the Opportunities panel prices (issue #642): resolves the
 * Character filter to ids, loads each one's blueprints, and seeds the
 * candidates from them. Split out of `OpportunitiesPanel` (issue #4253).
 */
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
  /** Every account Character, for resolving the `'all'` filter. */
  characterCandidates: readonly { characterId: number }[];
  characterNames: ReadonlyMap<number, string>;
  /**
   * The oldest blueprint fetch behind these candidates, or null — reported
   * up through here so the route can draw it beside the page title.
   */
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
  // `useResolvedCharacterFilter`, not the raw `resolveCharacterFilter`: this
  // panel's resolved filter feeds `characterIds` and through it the
  // blueprint-loading effect's dep array below, and the raw function
  // allocates a fresh `Set` per call for `'current'` — routing that
  // unmemoized identity into an effect dep array is exactly what caused an
  // infinite render loop here before (issue #675, React error #185).
  const resolvedCharacterIds = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const nextCharacterIds =
    resolvedCharacterIds === 'all'
      ? characterCandidates.map((c) => c.characterId)
      : [...resolvedCharacterIds];
  // Stabilizes the array's *identity* across renders where its *values*
  // haven't changed — memoizing on the ids themselves (via a joined string,
  // a plain primitive) rather than on `characterCandidates`'s own identity,
  // which still allocates a fresh array whenever `allCharacters`'s
  // `useLiveQuery` result changes, even to an equal roster. The
  // blueprint-loading effect below keys off this array by reference, so a
  // churning identity re-fires it every such commit — the "one redundant
  // load... when useLiveQuery swaps its default [] for the real roster" the
  // render-loop-settling test above already flags as bounded but
  // unaddressed; this closes it so the effect only ever re-fires when the
  // actual selected characters change.
  const characterIdsKey = nextCharacterIds.join(',');
  const characterIds = useMemo(
    () => (characterIdsKey === '' ? [] : characterIdsKey.split(',').map(Number)),
    [characterIdsKey]
  );

  // One state object rather than two separate `useState` calls: every branch
  // below is then exactly one `setState` call, matching this codebase's
  // `react-hooks/set-state-in-effect` rule.
  const [blueprintsState, setBlueprintsState] = useState<{
    ownedByCharacter: Map<number, CharacterBlueprint[]>;
    loading: boolean;
    /** Oldest fetch across every fetched Character — reported up through `onDataAgeChange`. */
    oldestFetchedAt: Date | null;
    /** Selected Characters whose blueprint read came back with nothing (offline, ESI down, nothing cached). */
    failedCount: number;
    /** When the oldest cached-copy blueprint list was read (ms); null when every list is a fresh read. */
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
      // A plain reset, not a derived sync worth restructuring around: no
      // Character is selected, so there is nothing to fetch and the panel's
      // empty state should say so immediately.
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
        // `null` is "nothing came back", which is not the same as a Character
        // who owns no blueprints (`[]`).
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
  /** Every selected Character came back with nothing: "no blueprints" would be a guess. */
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
