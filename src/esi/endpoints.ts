/**
 * Thin typed wrappers over the ESI endpoints NeoCom Desk v1 consumes.
 * Field names verified against https://esi.evetech.net/meta/openapi.json
 * (2026-08). Optional fields mirror the spec's non-required properties.
 */
import { esiFetch, ESI_BASE_URL, COMPATIBILITY_DATE, USER_AGENT, EsiError } from './client';
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

// --- GET /characters/{character_id}/wallet/journal (esi-wallet.read_character_wallet.v1) ---

export interface WalletJournalEntry {
  id: number;
  date: string;
  ref_type: string;
  description: string;
  amount?: number;
  balance?: number;
  context_id?: number;
  context_id_type?: string;
  first_party_id?: number;
  second_party_id?: number;
  reason?: string;
  tax?: number;
  tax_receiver_id?: number;
}

/** Paginated (X-Pages); every page is fetched sequentially (see fetchAllPages). */
export function getCharacterWalletJournal(
  characterId: number,
  options: EndpointOptions = {}
): Promise<WalletJournalEntry[]> {
  return fetchAllPages<WalletJournalEntry>(`/characters/${characterId}/wallet/journal`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/wallet/transactions (esi-wallet.read_character_wallet.v1) ---

export interface WalletTransaction {
  transaction_id: number;
  date: string;
  location_id: number;
  type_id: number;
  unit_price: number;
  quantity: number;
  client_id: number;
  is_buy: boolean;
  is_personal: boolean;
  journal_ref_id: number;
}

/**
 * Not X-Pages paginated: cursored via `from_id` ("transactions before this
 * id"), each call returning ESI's own page size. Followed for up to
 * MAX_TRANSACTION_PAGES calls (recent history only) rather than to
 * exhaustion, since a character's full transaction history is unbounded and
 * this view only needs recent activity.
 */
const MAX_TRANSACTION_PAGES = 5;

export async function getCharacterWalletTransactions(
  characterId: number,
  options: Omit<EndpointOptions, 'etag'> = {}
): Promise<WalletTransaction[]> {
  const items: WalletTransaction[] = [];
  let fromId: number | undefined;
  for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
    const result = await esiFetch<WalletTransaction[]>(
      `/characters/${characterId}/wallet/transactions`,
      {
        ...options,
        characterId,
        query: fromId === undefined ? undefined : { from_id: fromId },
      }
    );
    const page_ = result.data ?? [];
    if (page_.length === 0) break;
    items.push(...page_);
    fromId = Math.min(...page_.map((t) => t.transaction_id)) - 1;
  }
  return items;
}

// --- GET /characters/{character_id}/assets (esi-assets.read_assets.v1) ---

export interface CharacterAsset {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: 'station' | 'solar_system' | 'item' | 'other';
  location_flag: string;
  is_singleton: boolean;
  is_blueprint_copy?: boolean;
}

/** Paginated (X-Pages); every page is fetched sequentially (see fetchAllPages). */
export function getCharacterAssets(
  characterId: number,
  options: EndpointOptions = {}
): Promise<CharacterAsset[]> {
  return fetchAllPages<CharacterAsset>(`/characters/${characterId}/assets`, {
    ...options,
    characterId,
  });
}

// --- GET /universe/stations/{station_id} (public) ---

export interface UniverseStation {
  station_id: number;
  name: string;
  type_id: number;
  system_id: number;
}

export function getUniverseStation(
  stationId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseStation>> {
  return esiFetch<UniverseStation>(`/universe/stations/${stationId}`, options);
}

// --- GET /characters/{character_id}/mail (esi-mail.read_mail.v1) ---

/** One entry in a recipients list (mail header or body). */
export interface MailRecipient {
  recipient_id: number;
  recipient_type: 'alliance' | 'character' | 'corporation' | 'mailing_list';
}

/** Mail header: up to the 50 most recent, per ESI. */
export interface MailHeader {
  mail_id: number;
  from?: number;
  subject?: string;
  timestamp?: string;
  is_read?: boolean;
  labels?: number[];
  recipients?: MailRecipient[];
}

export function getCharacterMailHeaders(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MailHeader[]>> {
  return esiFetch<MailHeader[]>(`/characters/${characterId}/mail`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/mail/{mail_id} (esi-mail.read_mail.v1) ---

/** Mail body. Note: uses `read`, distinct from the header's `is_read`. */
export interface MailBody {
  from?: number;
  subject?: string;
  timestamp?: string;
  body?: string;
  read?: boolean;
  labels?: number[];
  recipients?: MailRecipient[];
}

export function getCharacterMail(
  characterId: number,
  mailId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MailBody>> {
  return esiFetch<MailBody>(`/characters/${characterId}/mail/${mailId}`, {
    ...options,
    characterId,
  });
}

// --- POST /universe/names (public) ---
// Not modeled through esiFetch: it's the only POST this app needs, is
// unauthenticated, and needs no ETag/pagination handling, so a body-only
// helper is smaller than threading method/body through the shared GET
// client. No rate-limit retry (low-volume public lookup); mirrors client.ts's
// header contract exactly.

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
  if (ids.length === 0) return [];
  const response = await fetch(new URL('/universe/names', ESI_BASE_URL), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Compatibility-Date': COMPATIBILITY_DATE,
      'X-User-Agent': USER_AGENT,
    },
    body: JSON.stringify(ids),
    signal: options.signal,
  });
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body.
    }
    throw new EsiError(response.status, `ESI request failed with status ${response.status}`, body);
  }
  return (await response.json()) as UniverseName[];
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
  return esiFetch<CalendarEventSummary[]>(`/characters/${characterId}/calendar`, {
    ...options,
    characterId,
  });
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
  });
}

// --- GET /characters/{character_id}/contracts (esi-contracts.read_character_contracts.v1) ---

export interface Contract {
  contract_id: number;
  issuer_id: number;
  issuer_corporation_id: number;
  assignee_id: number;
  acceptor_id: number;
  type: 'unknown' | 'item_exchange' | 'auction' | 'courier' | 'loan';
  status:
    | 'outstanding'
    | 'in_progress'
    | 'finished_issuer'
    | 'finished_contractor'
    | 'finished'
    | 'cancelled'
    | 'rejected'
    | 'failed'
    | 'deleted'
    | 'reversed';
  for_corporation: boolean;
  availability: 'public' | 'personal' | 'corporation' | 'alliance';
  date_issued: string;
  date_expired: string;
  title?: string;
  price?: number;
  reward?: number;
  collateral?: number;
  buyout?: number;
  volume?: number;
  days_to_complete?: number;
  date_accepted?: string;
  date_completed?: string;
  start_location_id?: number;
  end_location_id?: number;
}

/** Paginated (X-Pages); every page is fetched sequentially (see fetchAllPages). */
export function getCharacterContracts(
  characterId: number,
  options: EndpointOptions = {}
): Promise<Contract[]> {
  return fetchAllPages<Contract>(`/characters/${characterId}/contracts`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/orders (esi-markets.read_character_orders.v1) ---

export interface MarketOrder {
  order_id: number;
  type_id: number;
  region_id: number;
  location_id: number;
  is_buy_order?: boolean;
  is_corporation: boolean;
  price: number;
  volume_remain: number;
  volume_total: number;
  issued: string;
  duration: number;
  range: string;
  min_volume?: number;
  escrow?: number;
}

/** Not paginated: ESI returns every open order in one call. */
export function getCharacterOrders(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MarketOrder[]>> {
  return esiFetch<MarketOrder[]>(`/characters/${characterId}/orders`, {
    ...options,
    characterId,
  });
}

// --- GET /characters/{character_id}/orders/history (esi-markets.read_character_orders.v1) ---

export interface MarketOrderHistory extends MarketOrder {
  state: 'cancelled' | 'expired';
}

/** Paginated (X-Pages); every page is fetched sequentially (see fetchAllPages). */
export function getCharacterOrderHistory(
  characterId: number,
  options: EndpointOptions = {}
): Promise<MarketOrderHistory[]> {
  return fetchAllPages<MarketOrderHistory>(`/characters/${characterId}/orders/history`, {
    ...options,
    characterId,
  });
}
