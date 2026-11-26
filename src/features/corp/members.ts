import { conditionalPagedFetch, conditionalFetch } from '@/esi/cache';
import {
  getCorporationMemberRoles,
  getCorporationMembers,
  getCorporationMemberTracking,
  type CorporationMemberRoles,
  type CorporationMemberTracking,
} from '@/esi/endpoints';
import type { StatusResult } from '@/esi/cache';
import { resolveNames } from '@/features/character/names';
import { loadPublicCorporationRecord } from '@/features/character/publicInfoData';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import type { MemberActivity } from '@/engine/corp/members';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import { loadCorpPaginatedWithCacheStatus, loadCorpWithCacheStatus } from './corpRead';

export const KEYS = {
  members: 'members',
  tracking: 'membertracking',
  roles: 'roles',
} as const;

export function loadCorporationMemberIds(
  characterId: number,
  corporationId: number
): Promise<StatusResult<number[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCorporationMembers(characterId, corporationId, options)
  );
  return loadCorpPaginatedWithCacheStatus(characterId, corporationId, KEYS.members, fetchLive, {
    conditional,
  });
}

export function loadCorporationMemberTracking(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMemberTracking[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationMemberTracking(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.tracking, fetchLive, {
    conditional,
  });
}

export function loadCorporationMemberRoles(
  characterId: number,
  corporationId: number
): Promise<StatusResult<CorporationMemberRoles[]>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationMemberRoles(characterId, corporationId, options)
  );
  return loadCorpWithCacheStatus(characterId, corporationId, KEYS.roles, fetchLive, {
    conditional,
  });
}

export function toMemberRoles(
  rows: readonly CorporationMemberRoles[]
): ReadonlyMap<number, readonly string[]> {
  return new Map(rows.map((row) => [row.character_id, row.roles ?? []]));
}

function toMs(date: string | undefined): number | null {
  if (date === undefined) return null;
  const ms = Date.parse(date);
  return Number.isNaN(ms) ? null : ms;
}

export function toMemberActivity(rows: readonly CorporationMemberTracking[]): MemberActivity[] {
  return rows.map((row) => ({
    characterId: row.character_id,
    logonMs: toMs(row.logon_date),
    logoffMs: toMs(row.logoff_date),
    startMs: toMs(row.start_date),
    shipTypeId: row.ship_type_id ?? null,
    locationId: row.location_id ?? null,
  }));
}

async function resolveLocationNames(
  characterId: number,
  locationIds: readonly number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(locationIds)];
  const structureIds = unique.filter((id) => id >= UPWELL_STRUCTURE_ID_FLOOR);
  const bulkIds = unique.filter((id) => id < UPWELL_STRUCTURE_ID_FLOOR);

  const names = await resolveNames(bulkIds);
  await mapWithConcurrencyLimit(structureIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    const name = await loadStructureName(characterId, id);
    if (name !== null) names.set(id, name);
  });
  return names;
}

export interface MemberLabels {
  characters: ReadonlyMap<number, string>;
  ships: ReadonlyMap<number, string>;
  locations: ReadonlyMap<number, string>;
}

export const EMPTY_MEMBER_LABELS: MemberLabels = {
  characters: new Map(),
  ships: new Map(),
  locations: new Map(),
};

export async function loadMemberLabels(
  characterId: number,
  members: readonly MemberActivity[],
  extraCharacterIds: readonly number[] = []
): Promise<MemberLabels> {
  const shipTypeIds = members
    .map((member) => member.shipTypeId)
    .filter((id): id is number => id !== null);
  const locationIds = members
    .map((member) => member.locationId)
    .filter((id): id is number => id !== null);

  const [characters, ships, locations] = await Promise.all([
    resolveNames([...members.map((member) => member.characterId), ...extraCharacterIds]),
    loadTypeNames(shipTypeIds),
    resolveLocationNames(characterId, locationIds),
  ]);
  return { characters, ships, locations };
}

export async function loadCorporationCeoId(corporationId: number): Promise<number | null> {
  try {
    return (await loadPublicCorporationRecord(corporationId))?.ceo_id ?? null;
  } catch {
    return null;
  }
}
