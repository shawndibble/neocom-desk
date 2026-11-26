import { allianceSpace, type RaidWindow } from '@/engine/corp/sovereignty';
import { parseInstant } from '@/engine/esiInstant';
import {
  conditionalFetch,
  GLOBAL_CACHE_CHARACTER_ID,
  loadWithCache,
  STALE_AFTER,
  type CachedResult,
} from '@/esi/cache';
import type { EsiResult } from '@/esi/client';
import { getRaidableSkyhooks, getSovereigntySystems, type RaidableSkyhook } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { loadPublicCharacterInfoWithAge } from '@/features/character/publicInfoData';
import { RAIDS_RADII } from '../layout';
import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { planetInfo } from './spaceLookups';

export interface SovRaidSkyhook {
  key: string;
  systemId: number;
  holderId: number | null;
  planetName: string | null;
  window: RaidWindow | null;
}

export interface SovRaidsWidgetData {
  alliance: { id: number; name: string | null } | null;
  holdsSov: boolean;
  skyhooks: SovRaidSkyhook[];
  holderNames: Map<number, string>;
  systemNames: Map<number, string>;
  jumps: Map<number, number>;
  fetchedAt: Date | null;
  fromCache: boolean;
  freshForMs: number;
}

async function readPublic<T>(
  key: string,
  fetch: (options: { etag?: string }) => Promise<EsiResult<T>>
): Promise<CachedResult<T> | null> {
  const { fetchLive, conditional } = conditionalFetch(fetch);
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, key, fetchLive, { conditional });
}

export function loadRaidableList(): Promise<CachedResult<{ skyhooks: RaidableSkyhook[] }> | null> {
  return readPublic('skyhooks-raidable', getRaidableSkyhooks);
}

export async function loadSovRaids(characterId: number): Promise<SovRaidsWidgetData> {
  const character = await loadPublicCharacterInfoWithAge(characterId, {
    staleAfterMs: STALE_AFTER.default,
  });
  if (character === null) throw new Error('Character record could not be read');
  const allianceId = character.info.alliance_id ?? null;
  const [raidable, claims] = await Promise.all([
    loadRaidableList(),
    readPublic('sovereignty-systems', getSovereigntySystems),
  ]);
  if (raidable === null || claims === null) throw new Error('Skyhook raids could not be read');

  const holders = new Map<number, number | null>(
    claims.data.solar_systems.map((system) => [
      system.solar_system_id,
      system.claim?.alliance?.alliance_id ?? null,
    ])
  );
  const space =
    allianceId === null
      ? new Set<number>()
      : allianceSpace(
          [...holders].map(([systemId, holder]) => ({ systemId, allianceId: holder })),
          allianceId
        );
  const listed = raidable.data.skyhooks;
  const allSystemIds = [...new Set(listed.map((s) => s.solar_system_id))];
  const [jumps, systems] = await Promise.all([
    jumpsFromCurrent(characterId, allSystemIds),
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
  ]);
  const widest = Math.max(...RAIDS_RADII);
  const shown = listed.filter(
    (s) => space.has(s.solar_system_id) || (jumps.get(s.solar_system_id) ?? Infinity) <= widest
  );
  const holderIds = [
    ...new Set([
      ...(allianceId === null ? [] : [allianceId]),
      ...shown.flatMap((s) => holders.get(s.solar_system_id) ?? []),
    ]),
  ];
  const [planets, names] = await Promise.all([
    planetInfo([...new Set(shown.map((s) => s.planet_id))]),
    holderIds.length === 0
      ? new Map<number, string>()
      : resolveNames(holderIds).catch(() => new Map<number, string>()),
  ]);
  const systemNames = new Map<number, string>();
  for (const systemId of allSystemIds) {
    const name = systems?.get(systemId)?.name;
    if (name !== undefined) systemNames.set(systemId, name);
  }
  const older = raidable.fetchedAt < claims.fetchedAt ? raidable : claims;
  return {
    alliance: allianceId === null ? null : { id: allianceId, name: names.get(allianceId) ?? null },
    holdsSov: space.size > 0,
    skyhooks: listed.map((s): SovRaidSkyhook => {
      const startMs = parseInstant(s.theft_vulnerability?.start);
      const endMs = parseInstant(s.theft_vulnerability?.end);
      return {
        key: `${s.solar_system_id}:${s.planet_id}`,
        systemId: s.solar_system_id,
        holderId: holders.get(s.solar_system_id) ?? null,
        planetName: planets.get(s.planet_id)?.name ?? null,
        window: startMs === null || endMs === null ? null : { startMs, endMs },
      };
    }),
    holderNames: names,
    systemNames,
    jumps,
    fetchedAt: older.fetchedAt,
    fromCache: raidable.fromCache || claims.fromCache,
    freshForMs: STALE_AFTER.default,
  };
}
