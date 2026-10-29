import type { SystemJumpsEntry, SystemKillsEntry } from '@/engine/route/routeSafety';
import type { IncursionEntry } from '@/engine/incursions/incursionRows';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';
import type { EsiEndpointId } from '../registry';
import { chunk } from '../../lib/chunk';

// --- GET /universe/types/{type_id} (public) ---

/**
 * One dogma attribute value on a type. Verified live (2026-08): `value` is a
 * float even for integer-valued attributes (e.g. a skill requirement typeID).
 */
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
  /** Absent for types with no volume (e.g. skills, some non-item types). */
  volume?: number;
  /** m3 once packaged — what a hauler's hold actually carries. Absent where packaging changes nothing. */
  packaged_volume?: number;
  /** Absent for types with no dogma (most non-item types). */
  dogma_attributes?: DogmaAttribute[];
  /** The type's dogma effects — e.g. `turretFitted` (42) / `launcherFitted` (40) on a weapon. */
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

// --- GET /dogma/dynamic/items/{type_id}/{item_id} (public) ---

/**
 * One mutated item's base, mutaplasmid and full dogma set, absolute values
 * (live 2026-10-16: 23 attributes on a Heavy Abyssal Neut, not only the rolls).
 * A non-mutated id answers 400 against ESI's error limit: fetch through
 * `features/abyssal/dynamicItems.ts`.
 */
export interface DynamicItem {
  /** Character id of the pilot who applied the mutaplasmid. */
  created_by: number;
  /** The base module or drone type. */
  source_type_id: number;
  /** The mutaplasmid type. */
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

// --- GET /universe/groups/{group_id} (public) ---

/**
 * An item **Group** (`invGroups`) — the taxonomy node a type belongs to, not
 * a Market Group (GLOSSARY.md). The build-time SDE snapshot carries no
 * groupID->name map, so the dogma attributes that reference a Group by id
 * ("Used with (Charge Group)", "Can be fitted to") resolve through here.
 */
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

// --- GET /universe/regions/{region_id} (public) ---

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

// --- GET /universe/stations/{station_id} (public) ---

export interface UniverseStation {
  station_id: number;
  name: string;
  type_id: number;
  system_id: number;
  /** Owning corporation id — used to resolve the character's broker-fee standings. */
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

// --- GET /universe/moons/{moon_id} (public) ---

/** A moon: its name ("Efa V - Moon 3") is what the Corp Tax Book prints for a drilled moon. */
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

// --- GET /universe/stargates/{stargate_id} (public) ---

/**
 * A stargate and where it leads (issue #2329). `/universe/names` cannot name
 * a stargate — ESI rejects the whole batch — so Route Safety reads each gate
 * zKillboard places a kill at from here, once per session.
 */
export interface UniverseStargate {
  stargate_id: number;
  /** "Stargate (Nourvukaiken)". */
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

// --- GET /universe/systems/{system_id} (public) ---

export interface UniverseSystem {
  system_id: number;
  name: string;
  security_status: number;
  /**
   * The system's planets, and each planet's own moons and asteroid belts.
   * Optional because a system can have none — the shattered Thera-like and
   * Abyssal systems do — and ESI then omits the field rather than sending an
   * empty array.
   *
   * This is the only way to learn what a system a Character has no colony on
   * holds: `/characters/{id}/planets` covers owned colonies only. A planet's
   * type then comes from `/universe/planets/{planet_id}`, whose `type_id`
   * maps through `PiData.planetTypeByTypeId` to the same `PlanetType` string
   * an owned colony reports.
   */
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

// --- GET /universe/factions (public) ---

/** An NPC faction. Fields verified against live ESI (2026-10-28); `Unknown` and the like omit the optional ones. */
export interface UniverseFaction {
  faction_id: number;
  name: string;
  description: string;
  /** The faction's main corporation (its headquarters), absent for a faction without one. */
  corporation_id?: number;
  /** The Faction Warfare militia corporation; only the four empires have one. */
  militia_corporation_id?: number;
  /** Relative size, 0 for factions with no stations. */
  size_factor: number;
  /** The faction's capital system. */
  solar_system_id?: number;
  station_count: number;
  station_system_count: number;
  is_unique: boolean;
}

/** Every NPC faction in one call. */
export function getUniverseFactions(
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseFaction[]>> {
  return esiFetch<UniverseFaction[]>('/universe/factions', {
    ...options,
    endpointId: 'getUniverseFactions',
  });
}

// --- GET /incursions (public) ---

/** Every active Incursion: its constellation, staging system, state and influence. */
export function getIncursions(options: EndpointOptions = {}): Promise<EsiResult<IncursionEntry[]>> {
  return esiFetch<IncursionEntry[]>('/incursions', { ...options, endpointId: 'getIncursions' });
}

// --- GET /skyhooks/raidable (public) ---

/** A skyhook whose theft window is open now or opens shortly; no owner, no stock. */
export interface RaidableSkyhook {
  solar_system_id: number;
  planet_id: number;
  theft_vulnerability?: { start: string; end: string };
}

/** Every skyhook raidable now or shortly, universe-wide (issue #4798). */
export function getRaidableSkyhooks(
  options: EndpointOptions = {}
): Promise<EsiResult<{ skyhooks: RaidableSkyhook[] }>> {
  return esiFetch('/skyhooks/raidable', { ...options, endpointId: 'getRaidableSkyhooks' });
}

// --- GET /universe/system_kills (public) ---

/**
 * Ship, pod and NPC kills per solar system in the last hour. ESI lists only
 * systems that had kills, and none in wormhole space.
 */
export function getUniverseSystemKills(
  options: EndpointOptions = {}
): Promise<EsiResult<SystemKillsEntry[]>> {
  return esiFetch<SystemKillsEntry[]>('/universe/system_kills', {
    ...options,
    endpointId: 'getUniverseSystemKills',
  });
}

// --- GET /universe/system_jumps (public) ---

/**
 * Ship jumps per solar system in the last hour. ESI lists only systems that
 * had jumps, and none in wormhole space.
 */
export function getUniverseSystemJumps(
  options: EndpointOptions = {}
): Promise<EsiResult<SystemJumpsEntry[]>> {
  return esiFetch<SystemJumpsEntry[]>('/universe/system_jumps', {
    ...options,
    endpointId: 'getUniverseSystemJumps',
  });
}

// --- POST /universe/names (public) ---

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

// --- POST /characters/affiliation (public) ---

export interface CharacterAffiliation {
  character_id: number;
  corporation_id: number;
  alliance_id?: number;
  faction_id?: number;
}

/** ESI's documented cap on ids per request (maxItems in the spec) — shared with `postUniverseNames`. */
const AFFILIATION_BATCH_LIMIT = 1000;

/** Batches in flight at once: ESI bills errors against a shared budget, so stay small. */
const POST_CHUNK_CONCURRENCY = 2;

/**
 * POSTs `ids` to a bulk-lookup endpoint in `AFFILIATION_BATCH_LIMIT`-sized
 * batches, a couple at a time, and returns the results in batch order.
 */
async function postChunked<TIn, TOut>(
  path: string,
  endpointId: EsiEndpointId,
  ids: TIn[],
  signal: AbortSignal | undefined
): Promise<TOut[]> {
  const batches = chunk(ids, AFFILIATION_BATCH_LIMIT);
  const results: TOut[][] = batches.map(() => []);
  await mapWithConcurrencyLimit(batches, POST_CHUNK_CONCURRENCY, async (batch) => {
    const result = await esiFetch<TOut[]>(path, {
      method: 'POST',
      body: batch,
      signal,
      endpointId,
    });
    results[batches.indexOf(batch)] = result.data ?? [];
  });
  return results.flat();
}

/**
 * Bulk corp/alliance lookup for many characters in one round trip (up to 1000
 * per request; more are chunked into sequential requests) — replaces N
 * `getCharacterPublicInfo` calls with the one field the roster page actually
 * needs from each (issue: /characters page N+1 ESI calls).
 */
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

// --- POST /universe/ids (public) ---

/**
 * Name -> id resolution. Only the buckets a caller reads are modelled — the
 * Build Plan's build-system field (`systems`) and Pilot Lookup's exact-name
 * fallback (`characters`). ESI returns a bucket per category, so an
 * unmodelled bucket is simply ignored rather than an error.
 */
export interface UniverseIds {
  systems?: { id: number; name: string }[];
  characters?: { id: number; name: string }[];
  corporations?: { id: number; name: string }[];
  alliances?: { id: number; name: string }[];
}

/** Exact-name (case-insensitive) lookup. Empty input never calls ESI. */
export async function postUniverseIds(
  names: string[],
  options: { signal?: AbortSignal } = {}
): Promise<UniverseIds> {
  if (names.length === 0) return {};
  const result = await esiFetch<UniverseIds>('/universe/ids', {
    method: 'POST',
    body: names,
    signal: options.signal,
    endpointId: 'postUniverseIds',
  });
  return result.data ?? {};
}

// --- GET /universe/structures/{structure_id} (esi-universe.read_structures.v1) ---

/**
 * ACL-checked: ESI returns 403 for any structure outside the token's ACL,
 * even when the scope is held, so this is an authenticated call
 * (`characterId` attaches the bearer token) despite living beside the public
 * universe wrappers. Callers must not treat that 403 as a re-auth signal —
 * see `features/character/structures.ts`.
 */
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

// --- POST /route/{origin_system_id}/{destination_system_id} (public) ---

export interface RouteOptions extends EndpointOptions {
  /**
   * ESI's route preference, in its own words — the app's names map onto
   * these in one place (it is no longer called for jump counts).
   */
  preference?: 'Shorter' | 'Safer' | 'LessSecure';
  /**
   * 0–100, ESI's default 50: how strongly `preference` bends the route —
   * the game's own security-penalty slider. Verified live: Safer at 0 routes
   * Jita–Amarr in 11 jumps, at 50 in 45.
   */
  securityPenalty?: number;
  /**
   * Systems the route must not enter (ESI caps it at 1000). Verified live: a
   * hard filter — 404 "No route found" when the only way runs through one;
   * an avoided destination is fine. the app no longer routes through it.
   */
  avoid?: readonly number[];
}

/**
 * Waypoint solar-system ids, including both origin and destination.
 *
 * The POST endpoint (compatibility date 2025-09-30) replaced
 * `GET /route/{origin}/{destination}`: only it takes a security penalty,
 * and the legacy one is gone from the current spec.
 */
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
