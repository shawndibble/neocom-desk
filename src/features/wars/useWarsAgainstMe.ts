import { useEffect, useMemo, useState } from 'react';
import { warsAgainst, type StoredWar, type WarAgainstMe } from '@/engine/wars';
import { useNow } from '@/lib/useNow';
import { usePublicInfo } from '@/stores/publicInfo';
import { ACTIVE_WARS_POLL_MS, loadActiveWars } from './activeWars';
import { loadRecentWars, RECENT_WARS_REREAD_MS } from './recentWars';
import { useWarDeclaredNotice } from './useWarDeclaredNotice';

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
  const [listed, setListed] = useState<readonly StoredWar[]>(NONE);
  const [recent, setRecent] = useState<readonly StoredWar[]>(NONE);
  const noticed = useWarDeclaredNotice();

  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void loadActiveWars().then((next) => {
        if (!cancelled) setListed(next.length === 0 ? NONE : next);
      });
    load();
    // A page left open must neither keep a stale list nor miss a new one.
    const timer = setInterval(load, ACTIVE_WARS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // A war-declared Alert asks ESI for the newest wars, so the banner does not
  // wait for the next sweep; the sweep's list covers pilots with no Alerts.
  useEffect(() => {
    if (!noticed) return;
    let cancelled = false;
    const load = () =>
      void loadRecentWars().then((next) => {
        if (!cancelled) setRecent(next.length === 0 ? NONE : next);
      });
    load();
    const timer = setInterval(load, RECENT_WARS_REREAD_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [noticed]);

  const wars = useMemo(() => {
    if (recent.length === 0) return listed;
    // The fresher read of a war wins over the list's copy.
    const byId = new Map(listed.map((war) => [war.id, war]));
    for (const war of recent) byId.set(war.id, war);
    return [...byId.values()];
  }, [listed, recent]);

  const corporationId = info?.corporationId;
  const allianceId = info?.allianceId;
  return useMemo(
    () => (wars.length === 0 ? NO_HITS : warsAgainst(wars, { corporationId, allianceId }, now)),
    [wars, corporationId, allianceId, now]
  );
}
