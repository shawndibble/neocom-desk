/**
 * Skyhook raids' read (issue #4798), public routes only. `GET /skyhooks/raidable`
 * lists every raidable skyhook in New Eden; it is cut to the systems
 * `GET /sovereignty/systems` says the alliance holds before any planet is looked
 * up. Open, upcoming or closed is the builder's call at render time.
 */
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
import { getRaidableSkyhooks, getSovereigntySystems } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { loadPublicCharacterInfoWithAge } from '@/features/character/publicInfoData';
import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { planetInfo } from './spaceLookups';

export interface SovRaidSkyhook {
  key: string;
  systemId: number;
  /** "X-7OMU IV"; null when the planet could not be read. */
  planetName: string | null;
  /** Null when ESI sent no readable window: unknown, never safe. */
  window: RaidWindow | null;
}

export interface SovRaidsWidgetData {
  /** Null when the Character is in no alliance. */
  alliance: { id: number; name: string | null } | null;
  holdsSov: boolean;
  /** Raidable skyhooks in the alliance's space, any state. */
  skyhooks: SovRaidSkyhook[];
  systemNames: Map<number, string>;
  /** Jumps from the Current System; a system is absent when unknown. */
  jumps: Map<number, number>;
  fetchedAt: Date | null;
  fromCache: boolean;
  /** The reads' freshness window: a countdown under it is not shown to the minute. */
  freshForMs: number;
}

/** A public, universe-wide read: one cache row under the global sentinel. */
async function readPublic<T>(
  key: string,
  fetch: (options: { etag?: string }) => Promise<EsiResult<T>>
): Promise<CachedResult<T> | null> {
  const { fetchLive, conditional } = conditionalFetch(fetch);
  return loadWithCache(GLOBAL_CACHE_CHARACTER_ID, key, fetchLive, { conditional });
}

/**
 * Throws when the Character's record or either public list cannot be read, so
 * the widget keeps its last good read: an unread list is not "no raids".
 */
export async function loadSovRaids(characterId: number): Promise<SovRaidsWidgetData> {
  // The short window the header uses, so a change of alliance is noticed.
  const character = await loadPublicCharacterInfoWithAge(characterId, {
    staleAfterMs: STALE_AFTER.default,
  });
  if (character === null) throw new Error('Character record could not be read');
  const allianceId = character.info.alliance_id;
  const none: SovRaidsWidgetData = {
    alliance: null,
    holdsSov: false,
    skyhooks: [],
    systemNames: new Map(),
    jumps: new Map(),
    fetchedAt: character.fetchedAt,
    fromCache: false,
    freshForMs: STALE_AFTER.default,
  };
  if (allianceId === undefined) return none;

  const [raidable, claims, names] = await Promise.all([
    readPublic('skyhooks-raidable', getRaidableSkyhooks),
    readPublic('sovereignty-systems', getSovereigntySystems),
    resolveNames([allianceId]).catch(() => new Map<number, string>()),
  ]);
  if (raidable === null || claims === null) throw new Error('Skyhook raids could not be read');

  const space = allianceSpace(
    claims.data.solar_systems.map((system) => ({
      systemId: system.solar_system_id,
      allianceId: system.claim?.alliance?.alliance_id ?? null,
    })),
    allianceId
  );
  const kept = raidable.data.skyhooks.filter((s) => space.has(s.solar_system_id));
  const systemIds = [...new Set(kept.map((s) => s.solar_system_id))];
  const [planets, systems, jumps] = await Promise.all([
    planetInfo([...new Set(kept.map((s) => s.planet_id))]),
    import('@/sde/solarSystems').then((m) => m.loadSolarSystemsById()).catch(() => null),
    jumpsFromCurrent(characterId, systemIds),
  ]);
  const systemNames = new Map<number, string>();
  for (const systemId of systemIds) {
    const name = systems?.get(systemId)?.name;
    if (name !== undefined) systemNames.set(systemId, name);
  }
  const older = raidable.fetchedAt < claims.fetchedAt ? raidable : claims;
  return {
    alliance: { id: allianceId, name: names.get(allianceId) ?? null },
    holdsSov: space.size > 0,
    skyhooks: kept.map((s): SovRaidSkyhook => {
      const startMs = parseInstant(s.theft_vulnerability?.start);
      const endMs = parseInstant(s.theft_vulnerability?.end);
      return {
        key: `${s.solar_system_id}:${s.planet_id}`,
        systemId: s.solar_system_id,
        planetName: planets.get(s.planet_id)?.name ?? null,
        window: startMs === null || endMs === null ? null : { startMs, endMs },
      };
    }),
    systemNames,
    jumps,
    fetchedAt: older.fetchedAt,
    fromCache: raidable.fromCache || claims.fromCache,
    freshForMs: STALE_AFTER.default,
  };
}
