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

async function loadSkillsForCharacters(characterIds: readonly number[]): Promise<SkillsSnapshot> {
  const skillsByCharacter = new Map<number, ReadonlyMap<number, TrainedSkill>>();
  const fetchedAtByCharacter = new Map<number, Date>();
  const requests = characterIds.map((characterId) => async () => {
    const corrected = await loadCorrectedSkills(characterId, Date.now());
    if (corrected.skillsResult === null) return;
    skillsByCharacter.set(characterId, corrected.trained);
    if (corrected.fetchedAt) fetchedAtByCharacter.set(characterId, corrected.fetchedAt);
  });
  await mapWithConcurrencyLimit(requests, ESI_FANOUT_CONCURRENCY, async (run) => {
    try {
      await run();
    } catch {}
  });
  return { skillsByCharacter, fetchedAtByCharacter };
}

export interface CompareSkills {
  catalog: SkillCatalog | null;
  skillsByCharacter: ReadonlyMap<number, ReadonlyMap<number, TrainedSkill>>;
  loadedIds: readonly number[];
  pendingIds: ReadonlySet<number>;
  failedIds: ReadonlySet<number>;
  refreshing: boolean;
  oldestFetchedAt: Date | null;
  refresh: () => void;
}

export function useCompareSkills(selectedIds: readonly number[], enabled: boolean): CompareSkills {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [skillsByCharacter, setSkillsByCharacter] = useState<
    Map<number, ReadonlyMap<number, TrainedSkill>>
  >(new Map());
  const [fetchedAtByCharacter, setFetchedAtByCharacter] = useState<Map<number, Date>>(new Map());
  const skillsByCharacterRef = useRef(skillsByCharacter);
  useEffect(() => {
    skillsByCharacterRef.current = skillsByCharacter;
  });
  const [settledIds, setSettledIds] = useState<ReadonlySet<number>>(new Set());
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [committedRefreshNonce, setCommittedRefreshNonce] = useState(refreshNonce);

  useEffect(() => {
    if (enabled) void loadSkillCatalog().then(setCatalog);
  }, [enabled]);

  const selectionKey = `${enabled}:${selectedIds.join(',')}:${refreshNonce}`;

  useEffect(() => {
    if (!enabled || selectedIds.length === 0) return;
    let cancelled = false;
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
      invalidateFreshness();
      setRefreshNonce((n) => n + 1);
    },
  };
}
