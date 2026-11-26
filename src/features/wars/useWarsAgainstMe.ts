import { useEffect, useMemo, useState } from 'react';
import { useCharacters } from '@/features/character/useCharacters';
import { warsAgainst, type StoredWar, type WarAgainstMe, type WarEntityIds } from '@/engine/wars';
import { useNow } from '@/lib/useNow';
import { usePublicInfo } from '@/stores/publicInfo';
import { ACTIVE_WARS_POLL_MS, loadActiveWars } from './activeWars';
import { loadRecentWars, RECENT_WARS_REREAD_MS } from './recentWars';
import { useWarDeclaredNotice } from './useWarDeclaredNotice';

const NONE: readonly StoredWar[] = [];
const NO_HITS: readonly WarAgainstMe[] = [];

export interface WarsAgainstAccount {
  wars: readonly WarAgainstMe[];
  corporations: number;
}

export function useWarsAgainstMe(characterId: number): WarsAgainstAccount {
  const now = useNow();
  const infoById = usePublicInfo((state) => state.byCharacterId);
  const loadPublicInfo = usePublicInfo((state) => state.load);
  const loadManyPublicInfo = usePublicInfo((state) => state.loadMany);
  const characters = useCharacters();
  const [listed, setListed] = useState<readonly StoredWar[]>(NONE);
  const [recent, setRecent] = useState<readonly StoredWar[]>(NONE);
  const noticed = useWarDeclaredNotice();

  useEffect(() => {
    void loadPublicInfo(characterId);
  }, [characterId, loadPublicInfo]);

  const otherIds = characters
    .map((character) => character.characterId)
    .filter((id) => id !== characterId);
  const othersKey = otherIds.join(',');
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
    const timer = setInterval(load, ACTIVE_WARS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

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
    const byId = new Map(listed.map((war) => [war.id, war]));
    for (const war of recent) byId.set(war.id, war);
    return [...byId.values()];
  }, [listed, recent]);

  const parties = useMemo(() => {
    const storedCorp = new Map(characters.map((c) => [c.characterId, c.corporationId]));
    const byCorp = new Map<number, WarEntityIds>();
    for (const id of [characterId, ...othersKey.split(',').filter(Boolean).map(Number)]) {
      const info = infoById[id];
      const corporationId = info?.corporationId ?? storedCorp.get(id);
      if (corporationId === undefined) continue;
      const known = byCorp.get(corporationId);
      if (known === undefined)
        byCorp.set(corporationId, { corporationId, allianceId: info?.allianceId });
      else known.allianceId ??= info?.allianceId;
    }
    return [...byCorp.values()];
  }, [characterId, characters, othersKey, infoById]);

  const hits = useMemo(
    () => (wars.length === 0 || parties.length === 0 ? NO_HITS : warsAgainst(wars, parties, now)),
    [wars, parties, now]
  );
  return { wars: hits, corporations: parties.length };
}
