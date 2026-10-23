import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

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
  return characterGet<CharacterSkills>('getCharacterSkills', characterId, options);
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
  return characterGet<SkillQueueEntry[]>('getCharacterSkillQueue', characterId, options);
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
  return characterGet<CharacterAttributes>('getCharacterAttributes', characterId, options);
}

// --- GET /characters/{character_id}/implants (esi-clones.read_implants.v1) ---

/** Implant type IDs plugged into the active clone. */
export function getCharacterImplants(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<number[]>> {
  return characterGet<number[]>('getCharacterImplants', characterId, options);
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
  /** The Character's title in their corporation (was `title` before compat date 2026-06-09). */
  corporation_title?: string;
  /** Total achievement score (compat date 2026-06-09). */
  achievement_score?: number;
  /** The cosmetic title shown, a `characterTitles` UUID; absent when none (compat date 2026-06-09). */
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

// --- GET /characters/{character_id}/notifications (esi-characters.read_notifications.v1) ---

/**
 * EVE's own server-pushed notification (issue #274) — a different,
 * non-overlapping set from every other Notification Event, which the app
 * synthesizes by diffing. `type` is deliberately `string`, not a closed
 * union: CCP adds types without notice (esi/esi-issues#1380), so this app
 * must render an unrecognised one generically rather than drop or throw on
 * it. `text` is a YAML payload whose shape varies per type.
 */
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

// --- GET /characters/{character_id}/search (esi-search.search_structures.v1) ---

/** The categories this app's two callers ask for: Build Plan locations, and Forward's recipient picker. */
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

/**
 * Name search across the categories asked for, returning ids only.
 *
 * ESI requires at least three characters and, for `structure`, filters to what
 * this Character can actually dock at — the ACL is CCP's, not ours, so a
 * structure missing from the results is not a bug.
 */
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

// --- GET /characters/{character_id}/calendar (esi-calendar.read_calendar_events.v1) ---

export interface CalendarEventSummary {
  event_id: number;
  event_date: string;
  title: string;
  importance: number;
  event_response: 'declined' | 'not_responded' | 'accepted' | 'tentative';
}

/** Up to 50 events from now (or from `from_event`, unused here — v1 shows only the current page). */
export function getCharacterCalendar(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CalendarEventSummary[]>> {
  return characterGet<CalendarEventSummary[]>('getCharacterCalendar', characterId, options);
}

// --- GET /characters/{character_id}/calendar/{event_id} (esi-calendar.read_calendar_events.v1) ---

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

// --- PUT /characters/{character_id}/calendar/{event_id}/ (esi-calendar.respond_calendar_events.v1) ---

/** Narrower than `CalendarEventSummary['event_response']` — ESI's write only accepts these three, not `not_responded`. */
export type CalendarRsvpResponse = 'accepted' | 'declined' | 'tentative';

/** The app's second ESI write (the first is `putCharacterMail`): sets a character's RSVP on a calendar event. Answers 204 No Content on success. */
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

// --- GET /characters/{character_id}/corporationhistory (public) ---

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

// --- GET /characters/{character_id}/roles (esi-characters.read_corporation_roles.v1) ---

/**
 * Every field is optional: ESI omits an array rather than sending `[]`, so a
 * character with no corporation roles at all gets `{}` back. This endpoint has
 * no `x-required-roles` of its own, which is what lets it answer for every
 * character instead of 403-ing the ones with nothing to report.
 *
 * `roles` is the corporation-wide grant. The `roles_at_*` variants are scoped
 * to a single office and do not open the corporation-wide endpoints — see
 * `engine/corpRoles.ts`, which reads `roles` only.
 */
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

// --- GET /characters/{character_id}/clones (esi-clones.read_clones.v1) ---

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

// --- GET /characters/{character_id}/fatigue (esi-characters.read_fatigue.v1) ---

/** Every field is absent for a Character who has never jumped. */
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

// --- GET /characters/{character_id}/loyalty/points (esi-characters.read_loyalty.v1) ---

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

// --- GET /characters/{character_id}/location (esi-location.read_location.v1) ---

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

// --- GET /characters/{character_id}/ship (esi-location.read_ship_type.v1) ---

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
