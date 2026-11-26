import { characterPages } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult, TruncatableResult } from '../paginated';
import type { EndpointOptions } from './options';

export interface CharacterBlueprint {
  item_id: number;
  type_id: number;
  runs: number;
  material_efficiency: number;
  time_efficiency: number;
  quantity: number;
  location_id: number;
  location_flag: string;
}

export function getCharacterBlueprints(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<CharacterBlueprint>> {
  return characterPages<CharacterBlueprint>('getCharacterBlueprints', characterId, options);
}

export interface SystemCostIndexEntry {
  activity: string;
  cost_index: number;
}

export interface SystemCostIndices {
  solar_system_id: number;
  cost_indices: SystemCostIndexEntry[];
}

export function getIndustrySystemCostIndices(
  options: EndpointOptions = {}
): Promise<EsiResult<SystemCostIndices[]>> {
  return esiFetch<SystemCostIndices[]>('/industry/systems', {
    ...options,
    endpointId: 'getIndustrySystemCostIndices',
  });
}

export interface IndustryFacility {
  facility_id: number;
  owner_id: number;
  region_id: number;
  solar_system_id: number;
  type_id: number;
  tax?: number;
}

export function getIndustryFacilities(
  options: EndpointOptions = {}
): Promise<EsiResult<IndustryFacility[]>> {
  return esiFetch<IndustryFacility[]>('/industry/facilities', {
    ...options,
    endpointId: 'getIndustryFacilities',
  });
}

export interface IndustryJob {
  job_id: number;
  activity_id: number;
  blueprint_id?: number;
  blueprint_type_id: number;
  facility_id: number;
  station_id: number;
  output_location_id?: number;
  runs: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'cancelled' | 'delivered' | 'paused' | 'ready' | 'reverted';
  cost?: number;
  licensed_runs?: number;
  product_type_id?: number;
  successful_runs?: number;
}

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

export interface MiningLedgerRow {
  date: string;
  quantity: number;
  solar_system_id: number;
  type_id: number;
}

export function getCharacterMining(
  characterId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<MiningLedgerRow>> {
  return characterPages<MiningLedgerRow>('getCharacterMining', characterId, options);
}

export interface CorporationMiningExtraction {
  structure_id: number;
  moon_id: number;
  extraction_start_time: string;
  chunk_arrival_time: string;
  natural_decay_time: string;
}

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

export interface CorporationMiningObserver {
  observer_id: number;
  observer_type: string;
  last_updated: string;
}

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

export interface CorporationMiningObserverEntry {
  character_id: number;
  recorded_corporation_id: number;
  type_id: number;
  quantity: number;
  last_updated: string;
}

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
  successful_runs?: number;
}

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

export interface CorporationBlueprint {
  item_id: number;
  type_id: number;
  runs: number;
  material_efficiency: number;
  time_efficiency: number;
  quantity: number;
  location_id: number;
  location_flag: string;
}

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
