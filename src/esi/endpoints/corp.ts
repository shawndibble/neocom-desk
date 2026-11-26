import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult } from '../paginated';
import type { EndpointOptions } from './options';

export interface CorporationPublicInfo {
  name: string;
  ticker: string;
  ceo_id: number;
  creator_id: number;
  member_count: number;
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

export function getAllianceCorporations(
  allianceId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number[]>> {
  return esiFetch<number[]>(`/alliances/${allianceId}/corporations`, {
    ...options,
    endpointId: 'getAllianceCorporations',
  });
}

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

export type StarbaseState =
  'offline' | 'online' | 'onlining' | 'reinforced' | 'unanchoring' | (string & {});

export interface CorporationStarbase {
  starbase_id: number;
  system_id: number;
  type_id: number;
  moon_id?: number;
  onlined_since?: string;
  reinforced_until?: string;
  state?: StarbaseState;
  unanchor_at?: string;
}

export function getCorporationStarbases(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CorporationStarbase>> {
  return fetchAllPagesStatus<CorporationStarbase>(`/corporations/${corporationId}/starbases`, {
    ...options,
    characterId,
    endpointId: 'getCorporationStarbases',
  });
}

export interface StarbaseFuel {
  type_id: number;
  quantity: number;
}

export interface CorporationStarbaseDetail {
  fuels?: StarbaseFuel[];
}

export function getCorporationStarbase(
  characterId: number,
  corporationId: number,
  starbaseId: number,
  systemId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationStarbaseDetail>> {
  return esiFetch<CorporationStarbaseDetail>(
    `/corporations/${corporationId}/starbases/${starbaseId}`,
    {
      ...options,
      characterId,
      query: { system_id: systemId },
      endpointId: 'getCorporationStarbase',
    }
  );
}

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

export interface SovereigntyWindow {
  start: string;
  end: string;
}

export interface CorporationProjectSummary {
  id: string;
  name: string;
  state: string;
  last_modified: string;
  progress: { current: number; desired: number };
  reward?: { initial: number; remaining: number };
}

export interface CorporationProjectsPage {
  cursor?: { after?: string; before?: string };
  projects: CorporationProjectSummary[];
}

export function getCorporationProjects(
  characterId: number,
  corporationId: number,
  query: { after?: string; limit?: number } = {},
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationProjectsPage>> {
  return esiFetch(`/corporations/${corporationId}/projects`, {
    ...options,
    characterId,
    endpointId: 'getCorporationProjects',
    query: { state: 'Active', limit: query.limit ?? 100, after: query.after },
  });
}

export interface CorporationProjectManufactureItem {
  owner: string;
  items?: ({ type_id: number } | { group_id: number })[];
}

export interface CorporationProjectDetail extends CorporationProjectSummary {
  details: {
    description: string;
    career: string;
    created: string;
    expires?: string;
    finished?: string;
  };
  contribution?: {
    participation_limit: number;
    reward_per_contribution: number;
    submission_limit: number;
    submission_multiplier: number;
  };
  configuration: { manufacture_item?: CorporationProjectManufactureItem } & Record<string, unknown>;
}

export function getCorporationProject(
  characterId: number,
  corporationId: number,
  projectId: string,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationProjectDetail>> {
  return esiFetch(`/corporations/${corporationId}/projects/${projectId}`, {
    ...options,
    characterId,
    endpointId: 'getCorporationProject',
  });
}

export function getCorporationProjectContribution(
  characterId: number,
  corporationId: number,
  projectId: string,
  options: EndpointOptions = {}
): Promise<EsiResult<{ contributed: number; last_modified?: string }>> {
  return esiFetch(
    `/corporations/${corporationId}/projects/${projectId}/contribution/${characterId}`,
    {
      ...options,
      characterId,
      endpointId: 'getCorporationProjectContribution',
    }
  );
}

export function getCorporationSkyhooks(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<{ skyhooks: { id: number; planet_id: number }[] }>> {
  return esiFetch(`/corporations/${corporationId}/structures/skyhooks`, {
    ...options,
    characterId,
    endpointId: 'getCorporationSkyhooks',
  });
}

export interface CorporationSkyhookDetail {
  id: number;
  planet_id: number;
  is_active: boolean;
  state: string;
  reagents?: {
    last_cycle: string;
    secured_stock: number;
    unsecured_stock: number;
    type_id: number;
  }[];
  reinforcement_timer?: { end: string };
  theft_vulnerability?: SovereigntyWindow;
}

export function getCorporationSkyhook(
  characterId: number,
  corporationId: number,
  skyhookId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationSkyhookDetail>> {
  return esiFetch(`/corporations/${corporationId}/structures/skyhooks/${skyhookId}`, {
    ...options,
    characterId,
    endpointId: 'getCorporationSkyhook',
  });
}

export function getCorporationSovereigntyHubs(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<{ sovereignty_hubs: { id: number; solar_system_id: number }[] }>> {
  return esiFetch(`/corporations/${corporationId}/structures/sovereignty-hubs`, {
    ...options,
    characterId,
    endpointId: 'getCorporationSovereigntyHubs',
  });
}

export interface CorporationSovereigntyHubDetail {
  id: number;
  solar_system_id: number;
  reagent_bay: {
    last_updated: string;
    reagents: { type_id: number; amount: number; burning_per_hour: number }[];
  };
  vulnerability_window?: SovereigntyWindow;
}

export function getCorporationSovereigntyHub(
  characterId: number,
  corporationId: number,
  hubId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationSovereigntyHubDetail>> {
  return esiFetch(`/corporations/${corporationId}/structures/sovereignty-hubs/${hubId}`, {
    ...options,
    characterId,
    endpointId: 'getCorporationSovereigntyHub',
  });
}

export interface SovereigntyDevelopment {
  activity_defense_multiplier: number;
  military_level: number;
  industrial_level: number;
  strategic_level: number;
}

export interface SovereigntySystem {
  solar_system_id: number;
  claim?: { alliance?: { alliance_id?: number; development?: SovereigntyDevelopment } };
}

export function getSovereigntySystems(
  options: EndpointOptions = {}
): Promise<EsiResult<{ solar_systems: SovereigntySystem[] }>> {
  return esiFetch('/sovereignty/systems', { ...options, endpointId: 'getSovereigntySystems' });
}
