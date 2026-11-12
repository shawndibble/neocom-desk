import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CharacterRecord } from '@/db';
import { warsAgainst, type StoredWar, type WarAgainstMe, type WarEntityIds } from '@/engine/wars';
import { useNow } from '@/lib/useNow';
import { usePublicInfo } from '@/stores/publicInfo';
import { ACTIVE_WARS_POLL_MS, loadActiveWars } from './activeWars';
import { loadRecentWars, RECENT_WARS_REREAD_MS } from './recentWars';
import { useWarDeclaredNotice } from './useWarDeclaredNotice';

const NONE: readonly StoredWar[] = [];
const NO_HITS: readonly WarAgainstMe[] = [];
const NO_CHARACTERS: readonly CharacterRecord[] = [];

/**
 * The wars still running against any corporation (or alliance) the account's
 * Characters are in: the active Character's own first, then the rest, each
 * newest first with the active ones ahead of any not yet started. Empty while
 * loading, offline, or while no corporation is known yet.
 */
export function useWarsAgainstMe(characterId: number): readonly WarAgainstMe[] {
  const now = useNow();
  const infoById = usePublicInfo((state) => state.byCharacterId);
  const loadPublicInfo = usePublicInfo((state) => state.load);
  const loadManyPublicInfo = usePublicInfo((state) => state.loadMany);
  const characters = useLiveQuery(() => db.characters.toArray(), [], NO_CHARACTERS);
  const [listed, setListed] = useState<readonly StoredWar[]>(NONE);
  const [recent, setRecent] = useState<readonly StoredWar[]>(NONE);
  const noticed = useWarDeclaredNotice();

  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  // The alliance comes from public info; one batched read covers every other Character.
  const othersKey = characters
    .map((character) => character.characterId)
    .filter((id) => id !== characterId)
    .join(',');
  useEffect(() => {
    if (othersKey !== '') void loadManyPublicInfo(othersKey.split(',').map(Number));
  }, [othersKey, loadManyPublicInfo]);

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

  const parties = useMemo(() => {
    const storedCorp = new Map(characters.map((c) => [c.characterId, c.corporationId]));
    const ids = [
      characterId,
      ...characters.map((c) => c.characterId).filter((id) => id !== characterId),
    ];
    const seen = new Set<number>();
    const out: WarEntityIds[] = [];
    for (const id of ids) {
      const info = infoById[id];
      // The stored record knows the corporation without a fetch; public info adds the alliance.
      const corporationId = info?.corporationId ?? storedCorp.get(id);
      if (corporationId === undefined || seen.has(corporationId)) continue;
      seen.add(corporationId);
      out.push({ corporationId, allianceId: info?.allianceId });
    }
    return out;
  }, [characterId, characters, infoById]);

  return useMemo(
    () => (wars.length === 0 || parties.length === 0 ? NO_HITS : warsAgainst(wars, parties, now)),
    [wars, parties, now]
  );
}
