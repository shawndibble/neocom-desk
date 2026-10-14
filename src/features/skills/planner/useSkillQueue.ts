import { useEffect, useState } from 'react';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { loadCharacterSkillQueue, type CachedResult } from '../data';

/**
 * How often the page re-reads the character's in-game queue from ESI (#408):
 * the countdowns tick locally between reads, but a skill finishing, a new one
 * starting, or the queue being edited in-game all go unnoticed until the next
 * actual fetch. `loadCharacterSkillQueue` is cache-aware (`loadWithCache`
 * honors ESI's own `Expires`), so a call landing inside a still-fresh window
 * is a cheap cache hit, not a wasted round trip.
 */
const REFETCH_MS = 5 * 60_000;
/** Timer jitter allowance: a scheduled tick this close to a full cadence since the last fetch still counts as due. */
const REFETCH_SLACK_MS = 5_000;

/**
 * The character's in-game skill queue, kept fresh. `undefined` while the first
 * read is in flight, `null` when ESI had nothing to give.
 */
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
    // A hidden tab skips the refetch, and catches up the moment it is shown
    // again if one fell due meanwhile. A catch-up resets the clock, so the
    // next scheduled tick skips rather than refetching seconds later.
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
