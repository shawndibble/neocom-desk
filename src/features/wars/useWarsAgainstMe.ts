import { useEffect, useMemo, useState } from 'react';
import { warsAgainst, type StoredWar, type WarAgainstMe } from '@/engine/wars';
import { useNow } from '@/lib/useNow';
import { usePublicInfo } from '@/stores/publicInfo';
import { ACTIVE_WARS_POLL_MS, loadActiveWars } from './activeWars';

const NONE: readonly StoredWar[] = [];
const NO_HITS: readonly WarAgainstMe[] = [];

/**
 * The wars still running against a Character's corporation or alliance, newest
 * first with the active ones ahead of any not yet started. Empty while
 * loading, offline, or while the Character's corporation is not known yet.
 */
export function useWarsAgainstMe(characterId: number): readonly WarAgainstMe[] {
  const now = useNow();
  const info = usePublicInfo((state) => state.byCharacterId[characterId]);
  const loadPublicInfo = usePublicInfo((state) => state.load);
  const [wars, setWars] = useState<readonly StoredWar[]>(NONE);

  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void loadActiveWars(characterId).then((next) => {
        if (!cancelled) setWars(next.length === 0 ? NONE : next);
      });
    load();
    // A page left open must neither keep a stale list nor miss a new one.
    const timer = setInterval(load, ACTIVE_WARS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [characterId]);

  const corporationId = info?.corporationId;
  const allianceId = info?.allianceId;
  return useMemo(
    () => (wars.length === 0 ? NO_HITS : warsAgainst(wars, { corporationId, allianceId }, now)),
    [wars, corporationId, allianceId, now]
  );
}
