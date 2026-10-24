import { useEffect, useMemo, useRef, useState } from 'react';
import {
  planTimeToFinish,
  rankClosest,
  type CharacterTimingInput,
  type ClosestRanking,
  type PlanTimingResult,
} from '@/engine/skills/planTimeToFinish';
import type { EngineSkill, PlanEntry } from '@/engine/types';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadClosestInputs } from './closestInputs';

export interface ClosestCharacters {
  ranking: ClosestRanking;
  loaded: number;
  total: number;
}

/**
 * Every roster Character's time to finish `entries`. Fetches nothing until
 * `enabled`; inputs are kept for the life of the hook, so reopening is
 * instant and editing the plan re-ranks without a request. Results arrive
 * one Character at a time, so rows appear and re-sort as data lands.
 */
export function useClosestCharacters(
  characterIds: readonly number[],
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  enabled: boolean
): ClosestCharacters {
  const [inputs, setInputs] = useState<ReadonlyMap<number, CharacterTimingInput>>(new Map());
  const requested = useRef(new Set<number>());
  const [startMs] = useState(() => Date.now());
  const key = characterIds.join(',');

  useEffect(() => {
    if (!enabled) return;
    const todo = characterIds.filter((id) => !requested.current.has(id));
    if (todo.length === 0) return;
    todo.forEach((id) => requested.current.add(id));
    const jobs = todo.map((id) => async () => {
      const input = await loadClosestInputs(id, startMs);
      setInputs((prev) => new Map(prev).set(id, input));
    });
    void mapWithConcurrencyLimit(jobs, ESI_FANOUT_CONCURRENCY, (run) => run());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `key`
  }, [enabled, key, startMs]);

  const ranking = useMemo(() => {
    const startDate = new Date(startMs);
    const results = new Map<number, PlanTimingResult>();
    for (const id of characterIds) {
      const input = inputs.get(id);
      if (input) results.set(id, planTimeToFinish(entries, skills, input, startDate));
    }
    return rankClosest(results);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on `key`
  }, [inputs, entries, skills, key, startMs]);

  const loaded = characterIds.filter((id) => inputs.has(id)).length;
  return { ranking, loaded, total: characterIds.length };
}
