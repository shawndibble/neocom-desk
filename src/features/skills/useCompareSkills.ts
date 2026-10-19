import { useEffect, useMemo, useRef, useState } from 'react';
import { invalidateFreshness } from '@/esi/cache';
import type { TrainedSkill } from '@/engine/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { idsNeedingFetch } from '@/engine/skills/compareSkills';
import { loadCorrectedSkills } from './correctedSkills';
import { loadSkillCatalog, type SkillCatalog } from './skillMap';

interface SkillsSnapshot {
  skillsByCharacter: Map<number, ReadonlyMap<number, TrainedSkill>>;
  fetchedAtByCharacter: Map<number, Date>;
}

/**
 * Each requested character's queue-corrected trained-skill map, fetched with
 * the same bounded fan-out `roster.ts` uses — a request settles on its own,
 * so one character's failure — a throw, or no /skills payload at all — just leaves it out of the result. Callers pass
 * only the ids actually needing a fetch (`idsNeedingFetch`) and merge the
 * result into whatever is already cached for the rest of the selection.
 */
async function loadSkillsForCharacters(characterIds: readonly number[]): Promise<SkillsSnapshot> {
  const skillsByCharacter = new Map<number, ReadonlyMap<number, TrainedSkill>>();
  const fetchedAtByCharacter = new Map<number, Date>();
  const requests = characterIds.map((characterId) => async () => {
    const corrected = await loadCorrectedSkills(characterId, Date.now());
    // No /skills payload at all (ESI failed and nothing is cached): not a character with no skills.
    if (corrected.skillsResult === null) return;
    skillsByCharacter.set(characterId, corrected.trained);
    if (corrected.fetchedAt) fetchedAtByCharacter.set(characterId, corrected.fetchedAt);
  });
  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch {
      // Leave the character out of the map — it contributes no rows.
    }
  });
  return { skillsByCharacter, fetchedAtByCharacter };
}

export interface CompareSkills {
  catalog: SkillCatalog | null;
  skillsByCharacter: ReadonlyMap<number, ReadonlyMap<number, TrainedSkill>>;
  /** The selection minus anyone still waiting on a first fetch, or whose fetch failed: the columns actually drawn. */
  loadedIds: readonly number[];
  pendingIds: ReadonlySet<number>;
  /** Selected characters whose fetch settled without data: no column, rather than one of false zeros. */
  failedIds: ReadonlySet<number>;
  refreshing: boolean;
  oldestFetchedAt: Date | null;
  refresh: () => void;
}

/** Fetches and holds the trained skills of every selected character, for the skill comparison. */
export function useCompareSkills(selectedIds: readonly number[], enabled: boolean): CompareSkills {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [skillsByCharacter, setSkillsByCharacter] = useState<
    Map<number, ReadonlyMap<number, TrainedSkill>>
  >(new Map());
  const [fetchedAtByCharacter, setFetchedAtByCharacter] = useState<Map<number, Date>>(new Map());
  // Read inside the fetch effect instead of `skillsByCharacter` directly, so
  // the effect can stay keyed on `selectionKey` alone — adding the map itself
  // as a dependency would re-run it the instant that same effect updates it.
  const skillsByCharacterRef = useRef(skillsByCharacter);
  useEffect(() => {
    skillsByCharacterRef.current = skillsByCharacter;
  });
  // Characters whose fetch has settled at least once. Only these get a
  // column: one still waiting on its first fetch would otherwise read as a
  // column of zeros — "has not trained this", a confident false answer
  // (DESIGN §6a). A refresh keeps them settled, so their current levels stay
  // on screen until the new data replaces them. A failed fetch settles too,
  // but has no skills to show: `failedIds` names it, and it gets no column.
  const [settledIds, setSettledIds] = useState<ReadonlySet<number>>(new Set());
  const [refreshNonce, setRefreshNonce] = useState(0);
  // The refresh generation last committed; `refreshNonce` ahead of it means a
  // manual refresh is still in flight.
  const [committedRefreshNonce, setCommittedRefreshNonce] = useState(refreshNonce);

  useEffect(() => {
    if (enabled) void loadSkillCatalog().then(setCatalog);
  }, [enabled]);

  const selectionKey = `${enabled}:${selectedIds.join(',')}:${refreshNonce}`;

  useEffect(() => {
    // Nothing to fetch for a closed drawer or an empty selection.
    if (!enabled || selectedIds.length === 0) return;
    let cancelled = false;
    // A manual refresh forces every selected character to re-fetch (it also
    // calls invalidateFreshness()); otherwise only characters not already
    // held need a request — reselecting one costs nothing extra.
    // committedRefreshNonce only advances once a run actually commits, not
    // here: advancing it eagerly would let a refresh interrupted by a
    // mid-flight selection change look already-handled to the next run,
    // silently downgrading it from a forced refetch to a dedup-only one.
    const forceAll = refreshNonce !== committedRefreshNonce;
    const idsToFetch = idsNeedingFetch(
      selectedIds,
      new Set(skillsByCharacterRef.current.keys()),
      forceAll
    );
    if (idsToFetch.length === 0) {
      setCommittedRefreshNonce(refreshNonce);
      return;
    }
    void loadSkillsForCharacters(idsToFetch).then((result) => {
      if (cancelled) return;
      setCommittedRefreshNonce(refreshNonce);
      setSkillsByCharacter((prev) => new Map([...prev, ...result.skillsByCharacter]));
      setFetchedAtByCharacter((prev) => new Map([...prev, ...result.fetchedAtByCharacter]));
      setSettledIds((prev) => new Set([...prev, ...idsToFetch]));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on selectionKey, selectedIds/refreshNonce are its inputs
  }, [selectionKey]);

  const failedIds = useMemo(
    () => new Set(selectedIds.filter((id) => settledIds.has(id) && !skillsByCharacter.has(id))),
    [selectedIds, settledIds, skillsByCharacter]
  );
  const loadedIds = useMemo(
    () => selectedIds.filter((id) => settledIds.has(id) && !failedIds.has(id)),
    [selectedIds, settledIds, failedIds]
  );
  const pendingIds = useMemo(
    () => new Set(selectedIds.filter((id) => !settledIds.has(id))),
    [selectedIds, settledIds]
  );
  const oldestFetchedAt = useMemo(() => {
    let oldest: Date | null = null;
    for (const characterId of selectedIds) {
      const fetchedAt = fetchedAtByCharacter.get(characterId);
      if (fetchedAt && (!oldest || fetchedAt < oldest)) oldest = fetchedAt;
    }
    return oldest;
  }, [selectedIds, fetchedAtByCharacter]);

  return {
    catalog,
    skillsByCharacter,
    loadedIds,
    pendingIds,
    failedIds,
    refreshing: refreshNonce !== committedRefreshNonce,
    oldestFetchedAt,
    refresh: () => {
      // loadCorrectedSkills reads the skill queue through the windowed path
      // (issue #41); a manual refresh here must bypass it the same way
      // useRouteSnapshot's refresh does.
      invalidateFreshness();
      setRefreshNonce((n) => n + 1);
    },
  };
}
