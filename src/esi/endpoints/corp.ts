import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult } from '../paginated';
import type { EndpointOptions } from './options';

// --- GET /corporations/{corporation_id} (public) ---

export interface CorporationPublicInfo {
  name: string;
  ticker: string;
  ceo_id: number;
  creator_id: number;
  member_count: number;
  /**
   * Percentages (10 = 10%), not fractions. The compatibility date this app
   * sends replaced the old fractional `tax_rate` with this pair; reading the
   * old field gave every corporation's tax as NaN.
   */
  tax_rates?: { isk?: number; loyalty_point?: number };
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
  return esiFetch<CorporationPublicInfo>(`/corporations/${corporationId}`, {
    ...options,
    endpointId: 'getCorporationPublicInfo',
  });
}

// --- GET /corporations/{corporation_id}/alliancehistory (public) ---

/** One stint; no `alliance_id` is a stretch spent in no alliance. */
export interface CorporationAllianceHistoryEntry {
  record_id: number;
  start_date: string;
  alliance_id?: number;
  is_deleted?: boolean;
}

export function getCorporationAllianceHistory(
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationAllianceHistoryEntry[]>> {
  return esiFetch<CorporationAllianceHistoryEntry[]>(
    `/corporations/${corporationId}/alliancehistory`,
    {
      ...options,
      endpointId: 'getCorporationAllianceHistory',
    }
  );
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
  return esiFetch<AlliancePublicInfo>(`/alliances/${allianceId}`, {
    ...options,
    endpointId: 'getAlliancePublicInfo',
  });
}

// --- GET /alliances/{alliance_id}/corporations (public) ---

/** The ids of every corporation in the alliance, in no stated order. */
export function getAllianceCorporations(
  allianceId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number[]>> {
  return esiFetch<number[]>(`/alliances/${allianceId}/corporations`, {
    ...options,
    endpointId: 'getAllianceCorporations',
  });
}

// ---------------------------------------------------------------------------
// The `corp` scope group (issue #295).
//
// Corp-owned reads, all behind an opt-in grant and a server-side role gate.
// Each takes the *Character* making the call as well as the corporation id:
// ESI authorises these against that Character's own in-game roles, and
// `characterId` is what selects the access token (and the cache/activity-log
// owner) — the corporation id only shapes the path.
// ---------------------------------------------------------------------------

// --- GET /corporations/{corporation_id}/structures (esi-corporations.read_structures.v1) ---

export interface CorporationStructureService {
  name: string;
  state: 'online' | 'offline' | 'cleanup';
}

export interface CorporationStructure {
  structure_id: number;
  corporation_id: number;
  system_id: number;
  type_id: number;
  profile_id: number;
  /** Absent once the structure has run dry — which is exactly when it matters. */
  fuel_expires?: string;
  name?: string;
  reinforce_hour?: number;
  next_reinforce_hour?: number;
  next_reinforce_apply?: string;
  services?: CorporationStructureService[];
  state?:
    | 'anchor_vulnerable'
    | 'anchoring'
    | 'armor_reinforce'
    | 'armor_vulnerable'
    | 'deploy_vulnerable'
    | 'fitting_invulnerable'
    | 'hull_reinforce'
    | 'hull_vulnerable'
    | 'online_deprecated'
    | 'onlining_vulnerable'
    | 'shield_vulnerable'
    | 'unanchored'
    | 'unknown';
  state_timer_start?: string;
  state_timer_end?: string;
  unanchors_at?: string;
}

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCorporationStructures(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationStructure>> {
  return fetchAllPagesStatus<CorporationStructure>(`/corporations/${corporationId}/structures`, {
    ...options,
    characterId,
    endpointId: 'getCorporationStructures',
  });
}

// --- GET /corporations/{corporation_id}/divisions (esi-corporations.read_divisions.v1) ---

/** Both fields optional: ESI omits `name` for a division still on its default. */
export interface CorporationDivision {
  division?: number;
  name?: string;
}

export interface CorporationDivisions {
  hangar?: CorporationDivision[];
  wallet?: CorporationDivision[];
}

export function getCorporationDivisions(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationDivisions>> {
  return esiFetch<CorporationDivisions>(`/corporations/${corporationId}/divisions`, {
    ...options,
    characterId,
    endpointId: 'getCorporationDivisions',
  });
}

// --- GET /corporations/{corporation_id}/members (esi-corporations.read_corporation_membership.v1) ---

/** Character ids only — names come from `postUniverseNames`. Paginated (X-Pages). */
export function getCorporationMembers(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<number>> {
  return fetchAllPagesStatus<number>(`/corporations/${corporationId}/members`, {
    ...options,
    characterId,
    endpointId: 'getCorporationMembers',
  });
}

// --- GET /corporations/{corporation_id}/roles (esi-corporations.read_corporation_membership.v1) ---

/**
 * Every member's roles. Optional exactly as `CharacterCorporationRoles` is —
 * ESI omits an array rather than sending `[]` — and to be read the same way:
 * `roles` is the corporation-wide grant, the `roles_at_*` variants are scoped
 * to one office and open none of the corporation-wide endpoints
 * (`engine/corpRoles.ts`).
 */
export interface CorporationMemberRoles {
  character_id: number;
  roles?: string[];
  roles_at_hq?: string[];
  roles_at_base?: string[];
  roles_at_other?: string[];
  grantable_roles?: string[];
  grantable_roles_at_hq?: string[];
  grantable_roles_at_base?: string[];
  grantable_roles_at_other?: string[];
}

export function getCorporationMemberRoles(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationMemberRoles[]>> {
  return esiFetch<CorporationMemberRoles[]>(`/corporations/${corporationId}/roles`, {
    ...options,
    characterId,
    endpointId: 'getCorporationMemberRoles',
  });
}

// --- GET /corporations/{corporation_id}/membertracking (esi-corporations.track_members.v1) ---

/** Only `character_id` is guaranteed; a member who never logged in has little else. */
export interface CorporationMemberTracking {
  character_id: number;
  base_id?: number;
  location_id?: number;
  logon_date?: string;
  logoff_date?: string;
  ship_type_id?: number;
  start_date?: string;
}

export function getCorporationMemberTracking(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationMemberTracking[]>> {
  return esiFetch<CorporationMemberTracking[]>(`/corporations/${corporationId}/membertracking`, {
    ...options,
    characterId,
    endpointId: 'getCorporationMemberTracking',
  });
}

// --- GET /corporations/{corporation_id}/customs_offices (esi-planets.read_customs_offices.v1) ---

/**
 * One customs office. Tax rates are fractions (0.05 is 5%). A standing rate is
 * present only when that level is allowed, and `standing_level` and the
 * standing rates only when `allow_access_with_standings`. The reinforce window
 * is two whole UTC hours of the day, not a timer.
 */
export interface CorporationCustomsOffice {
  office_id: number;
  system_id: number;
  type_id?: number;
  reinforce_exit_start: number;
  reinforce_exit_end: number;
  allow_alliance_access: boolean;
  allow_access_with_standings: boolean;
  standing_level?: 'bad' | 'excellent' | 'good' | 'neutral' | 'terrible';
  corporation_tax_rate?: number;
  alliance_tax_rate?: number;
  excellent_standing_tax_rate?: number;
  good_standing_tax_rate?: number;
  neutral_standing_tax_rate?: number;
  bad_standing_tax_rate?: number;
  terrible_standing_tax_rate?: number;
}

/** Director-only (`canReadCustomsOffices`), cached 3600s, paginated (X-Pages). */
export function getCorporationCustomsOffices(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationCustomsOffice>> {
  return fetchAllPagesStatus<CorporationCustomsOffice>(
    `/corporations/${corporationId}/customs_offices`,
    { ...options, characterId, endpointId: 'getCorporationCustomsOffices' }
  );
}

// --- GET /corporations/{corporation_id}/roles/history (esi-corporations.read_corporation_membership.v1) ---

/**
 * One role change. ESI keeps about a month, newest page first, cached 3600s,
 * Director-only. `role_type` is `roles` for the corporation-wide grant, the
 * `roles_at_*` and `grantable_*` variants otherwise.
 */
export interface CorporationRoleHistory {
  changed_at: string;
  character_id: number;
  issuer_id: number;
  role_type: string;
  old_roles: string[];
  new_roles: string[];
}

export function getCorporationRoleHistory(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationRoleHistory>> {
  return fetchAllPagesStatus<CorporationRoleHistory>(
    `/corporations/${corporationId}/roles/history`,
    {
      ...options,
      characterId,
      endpointId: 'getCorporationRoleHistory',
    }
  );
}

// --- GET /corporations/{corporation_id}/titles (esi-corporations.read_titles.v1) ---

/** A corporation title: a named bundle of roles. Director-only, cached 3600s. */
export interface CorporationTitle {
  title_id: number;
  name?: string;
  roles?: string[];
}

export function getCorporationTitles(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationTitle[]>> {
  return esiFetch<CorporationTitle[]>(`/corporations/${corporationId}/titles`, {
    ...options,
    characterId,
    endpointId: 'getCorporationTitles',
  });
}

// --- GET /corporations/{corporation_id}/members/titles (esi-corporations.read_titles.v1) ---

/** The title ids each member holds. Director-only, cached 3600s. */
export interface CorporationMemberTitles {
  character_id: number;
  titles: number[];
}

export function getCorporationMemberTitles(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationMemberTitles[]>> {
  return esiFetch<CorporationMemberTitles[]>(`/corporations/${corporationId}/members/titles`, {
    ...options,
    characterId,
    endpointId: 'getCorporationMemberTitles',
  });
}
