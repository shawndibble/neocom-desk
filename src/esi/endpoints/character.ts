import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

export interface CharacterSkill {
  skill_id: number;
  trained_skill_level: number;
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
  return characterGet<CharacterSkills>('getCharacterSkills', characterId, options);
}

export interface SkillQueueEntry {
  skill_id: number;
  queue_position: number;
  finished_level: number;
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
  return characterGet<SkillQueueEntry[]>('getCharacterSkillQueue', characterId, options);
}

export interface CharacterAttributes {
  charisma: number;
  intelligence: number;
  memory: number;
  perception: number;
  willpower: number;
  accrued_remap_cooldown_date?: string;
  bonus_remaps?: number;
  last_remap_date?: string;
}

export function getCharacterAttributes(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterAttributes>> {
  return characterGet<CharacterAttributes>('getCharacterAttributes', characterId, options);
}

export function getCharacterImplants(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number[]>> {
  return characterGet<number[]>('getCharacterImplants', characterId, options);
}

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
  corporation_title?: string;
  achievement_score?: number;
  character_title_id?: string;
}

export function getCharacterPublicInfo(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterPublicInfo>> {
  return esiFetch<CharacterPublicInfo>(`/characters/${characterId}`, {
    ...options,
    endpointId: 'getCharacterPublicInfo',
  });
}

export interface CharacterNotification {
  notification_id: number;
  type: string;
  sender_id: number;
  sender_type: string;
  text?: string;
  timestamp: string;
  is_read?: boolean;
}

export function getCharacterNotifications(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterNotification[]>> {
  return characterGet<CharacterNotification[]>('getCharacterNotifications', characterId, options);
}

export interface CharacterSearchResult {
  station?: number[];
  structure?: number[];
  solar_system?: number[];
  character?: number[];
  corporation?: number[];
  alliance?: number[];
}

export type SearchCategory =
  'station' | 'structure' | 'solar_system' | 'character' | 'corporation' | 'alliance';

export function getCharacterSearch(
  characterId: number,
  categories: readonly SearchCategory[],
  search: string,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterSearchResult>> {
  return esiFetch<CharacterSearchResult>(`/characters/${characterId}/search`, {
    ...options,
    characterId,
    query: { categories: categories.join(','), search },
    endpointId: 'getCharacterSearch',
  });
}

export interface CalendarEventSummary {
  event_id: number;
  event_date: string;
  title: string;
  importance: number;
  event_response: 'declined' | 'not_responded' | 'accepted' | 'tentative';
}

export function getCharacterCalendar(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CalendarEventSummary[]>> {
  return characterGet<CalendarEventSummary[]>('getCharacterCalendar', characterId, options);
}

export interface CalendarEventDetail {
  event_id: number;
  title: string;
  date: string;
  duration: number;
  importance: number;
  owner_id: number;
  owner_name: string;
  owner_type: 'eve_server' | 'corporation' | 'faction' | 'character' | 'alliance';
  response: string;
  text: string;
}

export function getCharacterCalendarEvent(
  characterId: number,
  eventId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CalendarEventDetail>> {
  return esiFetch<CalendarEventDetail>(`/characters/${characterId}/calendar/${eventId}`, {
    ...options,
    characterId,
    endpointId: 'getCharacterCalendarEvent',
  });
}

export type CalendarRsvpResponse = 'accepted' | 'declined' | 'tentative';

export function putCharacterCalendarResponse(
  characterId: number,
  eventId: number,
  response: CalendarRsvpResponse,
  options: { signal?: AbortSignal } = {}
): Promise<EsiResult<void>> {
  return esiFetch<void>(`/characters/${characterId}/calendar/${eventId}/`, {
    ...options,
    characterId,
    method: 'PUT',
    body: { response },
    endpointId: 'putCharacterCalendarResponse',
  });
}

export interface CorporationHistoryEntry {
  record_id: number;
  corporation_id: number;
  start_date: string;
  is_deleted?: boolean;
}

export function getCharacterCorporationHistory(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CorporationHistoryEntry[]>> {
  return esiFetch<CorporationHistoryEntry[]>(`/characters/${characterId}/corporationhistory`, {
    ...options,
    endpointId: 'getCharacterCorporationHistory',
  });
}

export interface CharacterCorporationRoles {
  roles?: string[];
  roles_at_hq?: string[];
  roles_at_base?: string[];
  roles_at_other?: string[];
}

export function getCharacterRoles(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterCorporationRoles>> {
  return characterGet<CharacterCorporationRoles>('getCharacterRoles', characterId, options);
}

export interface JumpClone {
  jump_clone_id: number;
  location_id: number;
  location_type: 'station' | 'structure';
  implants: number[];
  name?: string;
}

export interface CharacterClones {
  home_location?: { location_id?: number; location_type?: 'station' | 'structure' };
  jump_clones: JumpClone[];
  last_clone_jump_date?: string;
  last_station_change_date?: string;
}

export function getCharacterClones(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterClones>> {
  return characterGet<CharacterClones>('getCharacterClones', characterId, options);
}

export interface CharacterFatigue {
  jump_fatigue_expire_date?: string;
  last_jump_date?: string;
  last_update_date?: string;
}

export function getCharacterFatigue(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterFatigue>> {
  return characterGet<CharacterFatigue>('getCharacterFatigue', characterId, options);
}

export interface CharacterLoyaltyPoints {
  corporation_id: number;
  loyalty_points: number;
}

export function getCharacterLoyaltyPoints(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterLoyaltyPoints[]>> {
  return characterGet<CharacterLoyaltyPoints[]>('getCharacterLoyaltyPoints', characterId, options);
}

export interface CharacterLocation {
  solar_system_id: number;
  station_id?: number;
  structure_id?: number;
}

export function getCharacterLocation(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterLocation>> {
  return characterGet<CharacterLocation>('getCharacterLocation', characterId, options);
}

export interface CharacterShip {
  ship_item_id: number;
  ship_name: string;
  ship_type_id: number;
}

export function getCharacterShip(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterShip>> {
  return characterGet<CharacterShip>('getCharacterShip', characterId, options);
}
