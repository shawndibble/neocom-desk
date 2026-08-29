/**
 * Thin typed wrappers over the ESI endpoints NeoCom Desk v1 consumes.
 * Field names verified against https://esi.evetech.net/meta/openapi.json
 * (2026-08). Optional fields mirror the spec's non-required properties.
 */
import { esiFetch } from './client';
import type { EsiResult } from './client';
import { fetchAllPages } from './paginated';

/** Options a caller may tune per request (conditional GET, cancellation). */
export interface EndpointOptions {
  etag?: string;
  signal?: AbortSignal;
}

// --- GET /characters/{character_id}/skills (esi-skills.read_skills.v1) ---

export interface CharacterSkill {
  skill_id: number;
  trained_skill_level: number;
  /** Can differ from trained due to alpha status / expert systems. */
  active_skill_level: number;
  skillpoints_in_skill: number;
}

export interface CharacterSkills {
  skills: CharacterSkill[];
  total_sp: number;
  unallocated_sp?: number;
}

export function getCharacterSkills(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterSkills>> {
  return esiFetch<CharacterSkills>(`/characters/${characterId}/skills`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/skillqueue (esi-skills.read_skillqueue.v1) ---

export interface SkillQueueEntry {
  skill_id: number;
  queue_position: number;
  finished_level: number;
  /** Absent when the queue is paused. */
  start_date?: string;
  finish_date?: string;
  level_start_sp?: number;
  level_end_sp?: number;
  training_start_sp?: number;
}

export function getCharacterSkillQueue(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<SkillQueueEntry[]>> {
  return esiFetch<SkillQueueEntry[]>(`/characters/${characterId}/skillqueue`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/attributes (esi-skills.read_skills.v1) ---

export interface CharacterAttributes {
  charisma: number;
  intelligence: number;
  memory: number;
  perception: number;
  willpower: number;
  /** Cooldown end for the remap accrued over time. */
  accrued_remap_cooldown_date?: string;
  bonus_remaps?: number;
  last_remap_date?: string;
}

export function getCharacterAttributes(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterAttributes>> {
  return esiFetch<CharacterAttributes>(`/characters/${characterId}/attributes`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/implants (esi-clones.read_implants.v1) ---

/** Implant type IDs plugged into the active clone. */
export function getCharacterImplants(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number[]>> {
  return esiFetch<number[]>(`/characters/${characterId}/implants`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/blueprints (esi-characters.read_blueprints.v1) ---

export interface CharacterBlueprint {
  item_id: number;
  type_id: number;
  /** -1 for an original (BPO); -2 or run count for a copy (BPC). */
  runs: number;
  material_efficiency: number;
  time_efficiency: number;
  quantity: number;
}

/** Paginated; every page is fetched sequentially (see fetchAllPages). */
export function getCharacterBlueprints(
  characterId: number,
  options: EndpointOptions = {}
): Promise<CharacterBlueprint[]> {
  return fetchAllPages<CharacterBlueprint>(`/characters/${characterId}/blueprints`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/wallet (esi-wallet.read_character_wallet.v1) ---

/** ISK balance. */
export function getCharacterWallet(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number>> {
  return esiFetch<number>(`/characters/${characterId}/wallet`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id} (public) ---

export interface CharacterPublicInfo {
  name: string;
  corporation_id: number;
  birthday: string;
  bloodline_id: number;
  gender: 'male' | 'female';
  race_id: number;
  alliance_id?: number;
  faction_id?: number;
  security_status?: number;
  description?: string;
  title?: string;
}

export function getCharacterPublicInfo(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterPublicInfo>> {
  return esiFetch<CharacterPublicInfo>(`/characters/${characterId}`, options);
}

// --- GET /corporations/{corporation_id} (public) ---

export interface CorporationPublicInfo {
  name: string;
  ticker: string;
  ceo_id: number;
  creator_id: number;
  member_count: number;
  tax_rate: number;
  alliance_id?: number;
  date_founded?: string;
  description?: string;
  faction_id?: number;
  home_station_id?: number;
  shares?: number;
  url?: string;
  war_eligible?: boolean;
}

export function getCorporationPublicInfo(
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationPublicInfo>> {
  return esiFetch<CorporationPublicInfo>(`/corporations/${corporationId}`, options);
}

// --- GET /universe/types/{type_id} (public) ---

export interface UniverseType {
  type_id: number;
  name: string;
  description: string;
  group_id: number;
  published: boolean;
}

export function getUniverseType(
  typeId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseType>> {
  return esiFetch<UniverseType>(`/universe/types/${typeId}`, options);
}

// --- GET /alliances/{alliance_id} (public) ---

export interface AlliancePublicInfo {
  name: string;
  ticker: string;
  creator_corporation_id: number;
  creator_id: number;
  date_founded: string;
  executor_corporation_id?: number;
  faction_id?: number;
}

export function getAlliancePublicInfo(
  allianceId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<AlliancePublicInfo>> {
  return esiFetch<AlliancePublicInfo>(`/alliances/${allianceId}`, options);
}
