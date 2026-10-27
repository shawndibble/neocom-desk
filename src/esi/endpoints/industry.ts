import { characterPages } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult, TruncatableResult } from '../paginated';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/blueprints (esi-characters.read_blueprints.v1) ---

export interface CharacterBlueprint {
  item_id: number;
  type_id: number;
  /** -1 for an original (BPO); -2 or run count for a copy (BPC). */
  runs: number;
  material_efficiency: number;
  time_efficiency: number;
  quantity: number;
  /** A station, structure, or (rarely) another item id — same shape a contract's `start_location_id` has, no `location_type` alongside it (issue #796). */
  location_id: number;
  /** e.g. `Hangar`, `AssetSafety` — where in that location the blueprint sits. Not currently read by anything; captured because ESI sends it alongside `location_id`. */
  location_flag: string;
}

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCharacterBlueprints(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<CharacterBlueprint>> {
  return characterPages<CharacterBlueprint>('getCharacterBlueprints', characterId, options);
}

// --- GET /industry/systems (public) ---

export interface SystemCostIndexEntry {
  activity: string;
  cost_index: number;
}

export interface SystemCostIndices {
  solar_system_id: number;
  cost_indices: SystemCostIndexEntry[];
}

/** Per-system industry cost indices, all activities. */
export function getIndustrySystemCostIndices(
  options: EndpointOptions = {}
): Promise<EsiResult<SystemCostIndices[]>> {
  return esiFetch<SystemCostIndices[]>('/industry/systems', {
    ...options,
    endpointId: 'getIndustrySystemCostIndices',
  });
}

// --- GET /industry/facilities (public) ---

/** An NPC station that runs industry jobs. ESI sends no `tax` on any entry. */
export interface IndustryFacility {
  facility_id: number;
  owner_id: number;
  region_id: number;
  solar_system_id: number;
  type_id: number;
  tax?: number;
}

/** Every NPC station with industry services (no player structures). */
export function getIndustryFacilities(
  options: EndpointOptions = {}
): Promise<EsiResult<IndustryFacility[]>> {
  return esiFetch<IndustryFacility[]>('/industry/facilities', {
    ...options,
    endpointId: 'getIndustryFacilities',
  });
}

// --- GET /characters/{character_id}/industry/jobs (esi-industry.read_character_jobs.v1) ---

/**
 * Modeled fields only: this app shows active jobs, not installer/location
 * bookkeeping. Verified against the live schema (2026-08) — `station_id` is
 * required, and this endpoint is NOT X-Pages paginated (only the corp one is).
 */
export interface IndustryJob {
  job_id: number;
  activity_id: number;
  blueprint_type_id: number;
  facility_id: number;
  station_id: number;
  runs: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'cancelled' | 'delivered' | 'paused' | 'ready' | 'reverted';
  cost?: number;
  licensed_runs?: number;
  product_type_id?: number;
}

/**
 * Not paginated, unlike the corp variant. `include_completed` has no documented
 * server-side default here, so it is always sent explicitly; false for v1.
 */
export function getCharacterIndustryJobs(
  characterId: number,
  options: EndpointOptions & { includeCompleted?: boolean } = {}
): Promise<EsiResult<IndustryJob[]>> {
  const { includeCompleted, ...rest } = options;
  return esiFetch<IndustryJob[]>(`/characters/${characterId}/industry/jobs`, {
    ...rest,
    characterId,
    endpointId: 'getCharacterIndustryJobs',
    query: { include_completed: includeCompleted ?? false },
  });
}

/**
 * One pre-aggregated row of a character's personal mining ledger: CCP
 * collapses everything mined in one (date, solar system, type) to a single
 * row before it ever reaches the app — no intra-day timestamp, no moon
 * identity (docs/context/decisions/20260905-170644-moon-mining-tax-ledger.md).
 * 30-day retention on ESI's side (the app's own ledger keeps a year).
 */
export interface MiningLedgerRow {
  /** EVE/UTC calendar date, e.g. "2026-09-04". */
  date: string;
  quantity: number;
  solar_system_id: number;
  type_id: number;
}

// --- GET /characters/{character_id}/mining/ (esi-industry.read_character_mining.v1) ---

export function getCharacterMining(
  characterId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<MiningLedgerRow>> {
  return characterPages<MiningLedgerRow>('getCharacterMining', characterId, options);
}

// --- GET /corporation/{corporation_id}/mining/extractions (esi-industry.read_corporation_mining.v1) ---

export interface CorporationMiningExtraction {
  structure_id: number;
  moon_id: number;
  /** When the drill was started. */
  extraction_start_time: string;
  /** When the chunk is ready to fracture — the date a moon op is planned around. */
  chunk_arrival_time: string;
  /** When an unfractured chunk breaks up on its own. */
  natural_decay_time: string;
}

/**
 * Singular `/corporation/` in the path, unlike every other corp endpoint here.
 * CCP's own inconsistency in the live spec, not a typo — see the matching note
 * in `registry.ts`. Paginated (X-Pages).
 */
export function getCorporationMiningExtractions(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationMiningExtraction>> {
  return fetchAllPagesStatus<CorporationMiningExtraction>(
    `/corporation/${corporationId}/mining/extractions`,
    {
      ...options,
      characterId,
      endpointId: 'getCorporationMiningExtractions',
    }
  );
}

// --- GET /corporation/{corporation_id}/mining/observers (esi-industry.read_corporation_mining.v1) ---

/**
 * One refinery that keeps a mining ledger. Only Athanors and Tataras do;
 * a Metenox has no ledger and never appears here (epic #4055).
 */
export interface CorporationMiningObserver {
  observer_id: number;
  /** `structure` is the only value ESI documents. */
  observer_type: string;
  /** A date (`YYYY-MM-DD`), not a timestamp: the day the ledger last changed. */
  last_updated: string;
}

/**
 * Accountant-gated (`canReadMiningLedger`), cached 3600s, paginated
 * (X-Pages). Singular `/corporation/`, like the extractions route.
 */
export function getCorporationMiningObservers(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationMiningObserver>> {
  return fetchAllPagesStatus<CorporationMiningObserver>(
    `/corporation/${corporationId}/mining/observers`,
    {
      ...options,
      characterId,
      endpointId: 'getCorporationMiningObservers',
    }
  );
}

// --- GET /corporation/{corporation_id}/mining/observers/{observer_id} (esi-industry.read_corporation_mining.v1) ---

/**
 * One row of a refinery's mining ledger: everything one character mined of
 * one ore type there on one day. The row's `quantity` keeps growing through the day it describes,
 * so a consumer upserts on (character, type, day) rather than appending.
 */
export interface CorporationMiningObserverEntry {
  character_id: number;
  /** The miner's corporation when the ore was recorded: what separates members from guests. */
  recorded_corporation_id: number;
  type_id: number;
  /** Units, not m³. */
  quantity: number;
  /** A date (`YYYY-MM-DD`): the EVE/UTC day this row sums. */
  last_updated: string;
}

/** Accountant-gated (`canReadMiningLedger`), cached 3600s, paginated (X-Pages). */
export function getCorporationMiningObserver(
  characterId: number,
  corporationId: number,
  observerId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationMiningObserverEntry>> {
  return fetchAllPagesStatus<CorporationMiningObserverEntry>(
    `/corporation/${corporationId}/mining/observers/${observerId}`,
    {
      ...options,
      characterId,
      endpointId: 'getCorporationMiningObserver',
    }
  );
}

// --- GET /corporations/{corporation_id}/industry/jobs (esi-industry.read_corporation_jobs.v1) ---

/**
 * The corp variant of `IndustryJob`. Two real differences from the character
 * one, both from the live schema: `location_id` in place of `station_id`, and
 * this endpoint *is* X-Pages paginated.
 */
export interface CorporationIndustryJob {
  job_id: number;
  installer_id: number;
  activity_id: number;
  blueprint_id: number;
  blueprint_type_id: number;
  blueprint_location_id: number;
  output_location_id: number;
  facility_id: number;
  location_id: number;
  runs: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'cancelled' | 'delivered' | 'paused' | 'ready' | 'reverted';
  cost?: number;
  duration?: number;
  licensed_runs?: number;
  probability?: number;
  product_type_id?: number;
}

/**
 * Paginated (X-Pages), unlike the character variant. `include_completed` is
 * sent explicitly for the same reason as there: no documented server-side
 * default.
 */
export function getCorporationIndustryJobs(
  characterId: number,
  corporationId: number,
  options: EndpointOptions & { includeCompleted?: boolean } = {}
): Promise<PaginatedResult<CorporationIndustryJob>> {
  const { includeCompleted, ...rest } = options;
  return fetchAllPagesStatus<CorporationIndustryJob>(
    `/corporations/${corporationId}/industry/jobs`,
    {
      ...rest,
      characterId,
      endpointId: 'getCorporationIndustryJobs',
      query: { include_completed: includeCompleted ?? false },
    }
  );
}

// --- GET /corporations/{corporation_id}/blueprints (esi-corporations.read_blueprints.v1) ---

/** The corp twin of `CharacterBlueprint` (issue #839) — same fields, ESI mirrors the shape field-for-field. */
export interface CorporationBlueprint {
  item_id: number;
  type_id: number;
  /** -1 for an original (BPO); -2 or run count for a copy (BPC). */
  runs: number;
  material_efficiency: number;
  time_efficiency: number;
  quantity: number;
  location_id: number;
  location_flag: string;
}

/** Paginated (X-Pages); Director-only (`engine/corpRoles.ts`'s `canReadBlueprints`). */
export function getCorporationBlueprints(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<CorporationBlueprint>> {
  return fetchAllPagesStatus<CorporationBlueprint>(`/corporations/${corporationId}/blueprints`, {
    ...options,
    characterId,
    endpointId: 'getCorporationBlueprints',
  });
}
