import type { SystemJumpsEntry, SystemKillsEntry } from '@/engine/route/routeSafety';
import type { IncursionEntry } from '@/engine/incursions/incursionRows';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { chunk } from '@/lib/chunk';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import type { EndpointOptions } from './options';
import { postChunked } from './postChunked';

export interface DogmaAttribute {
  attribute_id: number;
  value: number;
}

export interface UniverseType {
  type_id: number;
  name: string;
  description: string;
  group_id: number;
  published: boolean;
  volume?: number;
  packaged_volume?: number;
  dogma_attributes?: DogmaAttribute[];
  dogma_effects?: { effect_id: number; is_default: boolean }[];
}

export function getUniverseType(
  typeId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseType>> {
  return esiFetch<UniverseType>(`/universe/types/${typeId}`, {
    ...options,
    endpointId: 'getUniverseType',
  });
}

export interface DynamicItem {
  created_by: number;
  source_type_id: number;
  mutator_type_id: number;
  dogma_attributes: DogmaAttribute[];
  dogma_effects: { effect_id: number; is_default: boolean }[];
}

export function getDogmaDynamicItem(
  typeId: number,
  itemId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<DynamicItem>> {
  return esiFetch<DynamicItem>(`/dogma/dynamic/items/${typeId}/${itemId}`, {
    ...options,
    endpointId: 'getDogmaDynamicItem',
  });
}

export interface UniverseGroup {
  group_id: number;
  name: string;
  category_id: number;
  published: boolean;
  types: number[];
}

export function getUniverseGroup(
  groupId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseGroup>> {
  return esiFetch<UniverseGroup>(`/universe/groups/${groupId}`, {
    ...options,
    endpointId: 'getUniverseGroup',
  });
}

export interface UniverseRegion {
  region_id: number;
  name: string;
}

export function getUniverseRegion(
  regionId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseRegion>> {
  return esiFetch<UniverseRegion>(`/universe/regions/${regionId}`, {
    ...options,
    endpointId: 'getUniverseRegion',
  });
}

export interface UniverseStation {
  station_id: number;
  name: string;
  type_id: number;
  system_id: number;
  owner?: number;
}

export function getUniverseStation(
  stationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseStation>> {
  return esiFetch<UniverseStation>(`/universe/stations/${stationId}`, {
    ...options,
    endpointId: 'getUniverseStation',
  });
}

export interface UniverseMoon {
  moon_id: number;
  name: string;
  system_id: number;
}

export function getUniverseMoon(
  moonId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseMoon>> {
  return esiFetch<UniverseMoon>(`/universe/moons/${moonId}`, {
    ...options,
    endpointId: 'getUniverseMoon',
  });
}

export interface UniverseStargate {
  stargate_id: number;
  name: string;
  system_id: number;
  destination: { stargate_id: number; system_id: number };
}

export function getUniverseStargate(
  stargateId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseStargate>> {
  return esiFetch<UniverseStargate>(`/universe/stargates/${stargateId}`, {
    ...options,
    endpointId: 'getUniverseStargate',
  });
}

export interface UniverseSystem {
  system_id: number;
  name: string;
  security_status: number;
  planets?: {
    planet_id: number;
    moons?: number[];
    asteroid_belts?: number[];
  }[];
}

export function getUniverseSystem(
  systemId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseSystem>> {
  return esiFetch<UniverseSystem>(`/universe/systems/${systemId}`, {
    ...options,
    endpointId: 'getUniverseSystem',
  });
}

export interface UniverseFaction {
  faction_id: number;
  name: string;
  description: string;
  corporation_id?: number;
  militia_corporation_id?: number;
  size_factor: number;
  solar_system_id?: number;
  station_count: number;
  station_system_count: number;
  is_unique: boolean;
}

export function getUniverseFactions(
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseFaction[]>> {
  return esiFetch<UniverseFaction[]>('/universe/factions', {
    ...options,
    endpointId: 'getUniverseFactions',
  });
}

export function getIncursions(options: EndpointOptions = {}): Promise<EsiResult<IncursionEntry[]>> {
  return esiFetch<IncursionEntry[]>('/incursions', { ...options, endpointId: 'getIncursions' });
}

export interface RaidableSkyhook {
  solar_system_id: number;
  planet_id: number;
  theft_vulnerability?: { start: string; end: string };
}

export function getRaidableSkyhooks(
  options: EndpointOptions = {}
): Promise<EsiResult<{ skyhooks: RaidableSkyhook[] }>> {
  return esiFetch('/skyhooks/raidable', { ...options, endpointId: 'getRaidableSkyhooks' });
}

export function getUniverseSystemKills(
  options: EndpointOptions = {}
): Promise<EsiResult<SystemKillsEntry[]>> {
  return esiFetch<SystemKillsEntry[]>('/universe/system_kills', {
    ...options,
    endpointId: 'getUniverseSystemKills',
  });
}

export function getUniverseSystemJumps(
  options: EndpointOptions = {}
): Promise<EsiResult<SystemJumpsEntry[]>> {
  return esiFetch<SystemJumpsEntry[]>('/universe/system_jumps', {
    ...options,
    endpointId: 'getUniverseSystemJumps',
  });
}

export interface UniverseName {
  id: number;
  name: string;
  category:
    | 'alliance'
    | 'character'
    | 'constellation'
    | 'corporation'
    | 'inventory_type'
    | 'region'
    | 'solar_system'
    | 'station'
    | 'faction';
}

export async function postUniverseNames(
  ids: number[],
  options: { signal?: AbortSignal } = {}
): Promise<UniverseName[]> {
  return postChunked<number, UniverseName>(
    '/universe/names',
    'postUniverseNames',
    ids,
    options.signal
  );
}

export interface CharacterAffiliation {
  character_id: number;
  corporation_id: number;
  alliance_id?: number;
  faction_id?: number;
}

export async function postCharactersAffiliation(
  characterIds: number[],
  options: { signal?: AbortSignal } = {}
): Promise<CharacterAffiliation[]> {
  return postChunked<number, CharacterAffiliation>(
    '/characters/affiliation',
    'postCharactersAffiliation',
    characterIds,
    options.signal
  );
}

export interface UniverseIds {
  systems?: { id: number; name: string }[];
  characters?: { id: number; name: string }[];
  corporations?: { id: number; name: string }[];
  alliances?: { id: number; name: string }[];
}

const UNIVERSE_IDS_BATCH = 500;

export async function postUniverseIds(
  names: string[],
  options: { signal?: AbortSignal } = {}
): Promise<UniverseIds> {
  const batches = chunk(names, UNIVERSE_IDS_BATCH);
  const answers: UniverseIds[] = batches.map(() => ({}));
  await mapWithConcurrencyLimit(batches, 2, async (batch) => {
    const result = await esiFetch<UniverseIds>('/universe/ids', {
      method: 'POST',
      body: batch,
      signal: options.signal,
      endpointId: 'postUniverseIds',
    });
    answers[batches.indexOf(batch)] = result.data ?? {};
  });
  const merged: UniverseIds = {};
  for (const answer of answers) {
    for (const [bucket, entries] of Object.entries(answer)) {
      const key = bucket as keyof UniverseIds;
      merged[key] = [...(merged[key] ?? []), ...(entries as { id: number; name: string }[])];
    }
  }
  return merged;
}

export interface UniverseStructure {
  name: string;
  owner_id: number;
  solar_system_id: number;
  type_id?: number;
  position?: { x: number; y: number; z: number };
}

export function getUniverseStructure(
  characterId: number,
  structureId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseStructure>> {
  return esiFetch<UniverseStructure>(`/universe/structures/${structureId}`, {
    ...options,
    characterId,
    endpointId: 'getUniverseStructure',
  });
}

export interface RouteOptions extends EndpointOptions {
  preference?: 'Shorter' | 'Safer' | 'LessSecure';
  securityPenalty?: number;
  avoid?: readonly number[];
}

export async function postRoute(
  origin: number,
  destination: number,
  options: RouteOptions = {}
): Promise<EsiResult<number[]>> {
  const { preference, securityPenalty, avoid, ...rest } = options;
  const result = await esiFetch<{ route: number[] }>(`/route/${origin}/${destination}`, {
    ...rest,
    method: 'POST',
    endpointId: 'postRoute',
    body: {
      preference,
      security_penalty: securityPenalty,
      avoid_systems: avoid?.length ? avoid : undefined,
    },
  });
  return { ...result, data: result.data?.route ?? null };
}
