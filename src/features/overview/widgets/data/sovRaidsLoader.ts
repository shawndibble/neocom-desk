/**
 * Skyhook raids' read (issues #4798, #4781), public routes only. `GET
 * /skyhooks/raidable` lists every raidable skyhook in New Eden and `GET
 * /sovereignty/systems` says who holds each system: both are read once. The
 * builder cuts the list by the widget's Where setting (the Character's alliance,
 * or near the Current System), so one read serves every Skyhook raids widget.
 * Planets and holder names are looked up only for the skyhooks a widget can
 * show (the alliance's, or within the widest radius). Open, upcoming or closed
 * is the builder's call at render time.
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
import { getRaidableSkyhooks, getSovereigntySystems, type RaidableSkyhook } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { loadPublicCharacterInfoWithAge } from '@/features/character/publicInfoData';
import { RAIDS_RADII } from '../layout';
import { jumpsFromCurrent } from '@/features/route/jumpsFromCurrent';
import { planetInfo } from './spaceLookups';

export interface SovRaidSkyhook {
  key: string;
  systemId: number;
  /** The alliance holding the system's sov claim; null when unclaimed or unread. */
  holderId: number | null;
  /** "X-7OMU IV"; null when the planet could not be read. */
  planetName: string | null;
  /** Null when ESI sent no readable window: unknown, never safe. */
  window: RaidWindow | null;
}

export interface SovRaidsWidgetData {
  /** Null when the Character is in no alliance. */
  alliance: { id: number; name: string | null } | null;
  holdsSov: boolean;
  /** Every raidable skyhook, any holder and any state; a widget cuts it by its Where setting. */
  skyhooks: SovRaidSkyhook[];
  /** Names of the alliances holding the listed skyhooks' systems, where read. */
  holderNames: Map<number, string>;
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

/** The universe-wide raidable list, one cache row read per its cache header (issues #4798, #4784). */
export function loadRaidableList(): Promise<CachedResult<{ skyhooks: RaidableSkyhook[] }> | null> {
  return readPublic('skyhooks-raidable', getRaidableSkyhooks);
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
  // Only what a widget can show is looked up: the alliance's, or within the widest radius.
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
