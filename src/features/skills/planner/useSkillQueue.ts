import { useEffect, useState } from 'react';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { loadCharacterSkillQueue, type CachedResult } from '../data';
import { MINUTE_MS } from '@/lib/age';

const REFETCH_MS = 5 * MINUTE_MS;
const REFETCH_SLACK_MS = 5_000;

export function useSkillQueue(
  characterId: number
): CachedResult<SkillQueueEntry[]> | null | undefined {
  const [result, setResult] = useState<CachedResult<SkillQueueEntry[]> | null | undefined>(
    undefined
  );
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadCharacterSkillQueue(characterId).then((r) => {
        if (!cancelled) setResult(r);
      });
    };
    let lastLoadAt = Date.now();
    load();
    const id = setInterval(() => {
      if (document.hidden || Date.now() - lastLoadAt < REFETCH_MS - REFETCH_SLACK_MS) return;
      lastLoadAt = Date.now();
      load();
    }, REFETCH_MS);
    const onVisibilityChange = () => {
      if (document.hidden || Date.now() - lastLoadAt < REFETCH_MS) return;
      lastLoadAt = Date.now();
      load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [characterId]);
  return result;
}
