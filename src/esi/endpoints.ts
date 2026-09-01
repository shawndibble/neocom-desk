/**
 * Thin typed wrappers over the ESI endpoints NeoCom Desk v1 consumes.
 * Field names verified against https://esi.evetech.net/meta/openapi.json
 * (2026-08). Optional fields mirror the spec's non-required properties.
 *
 * Every wrapper passes its own name as `endpointId` on the `esiFetch`/
 * `fetchAllPagesStatus` call — that's the same key `ESI_REGISTRY` uses, so
 * the activity log (issue #32) can name the endpoint without a second
 * registry, and `endpointId` being typed `EsiEndpointId` makes a typo a
 * compile error.
 */
import { esiFetch, recordEsiActivity, outcomeForError } from './client';
import type { EsiResult } from './client';
import { fetchAllPagesStatus } from './paginated';
import type { PaginatedResult, TruncatableResult } from './paginated';

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
    endpointId: 'getCharacterSkills',
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
    endpointId: 'getCharacterSkillQueue',
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
    endpointId: 'getCharacterAttributes',
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
    endpointId: 'getCharacterImplants',
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

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCharacterBlueprints(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<CharacterBlueprint>> {
  return fetchAllPagesStatus<CharacterBlueprint>(`/characters/${characterId}/blueprints`, {
    ...options,
    characterId,
    endpointId: 'getCharacterBlueprints',
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
    endpointId: 'getCharacterWallet',
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
  return esiFetch<CharacterPublicInfo>(`/characters/${characterId}`, {
    ...options,
    endpointId: 'getCharacterPublicInfo',
  });
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
  return esiFetch<CorporationPublicInfo>(`/corporations/${corporationId}`, {
    ...options,
    endpointId: 'getCorporationPublicInfo',
  });
}

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
  /** Absent for types with no dogma (most non-item types). */
  dogma_attributes?: DogmaAttribute[];
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

/**
 * Paginated (X-Pages); see fetchAllPagesStatus. Returns the completeness flag
 * with the entries — a short journal must not reach the view looking whole.
 */
export function getCharacterWalletJournal(
  characterId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<WalletJournalEntry>> {
  return fetchAllPagesStatus<WalletJournalEntry>(`/characters/${characterId}/wallet/journal`, {
    ...options,
    characterId,
    endpointId: 'getCharacterWalletJournal',
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
 * id"). Followed for up to MAX_TRANSACTION_PAGES calls, not to exhaustion —
 * full history is unbounded and this view needs only recent activity.
 */
const MAX_TRANSACTION_PAGES = 5;

/**
 * Cursored, not X-Pages, so `fetchAllPagesStatus`'s own once-per-read
 * activity logging doesn't apply here — this loop does the same thing
 * itself: `endpointId` withheld from the per-page `esiFetch` calls, one
 * `recordEsiActivity` for the whole cursor walk (issue #32).
 */
export async function getCharacterWalletTransactions(
  characterId: number,
  options: Omit<EndpointOptions, 'etag'> = {}
): Promise<TruncatableResult<WalletTransaction>> {
  const items: WalletTransaction[] = [];
  let fromId: number | undefined;
  // The cap is a deliberate product limit, but the user still has to be told
  // when it bit. Using every call *and* getting data on the last one is the
  // only case where history may remain unfetched — it may also have ended
  // exactly there, and ESI gives no way to tell, so this errs toward warning.
  let truncated = false;
  try {
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
      truncated = page === MAX_TRANSACTION_PAGES - 1;
      // from_id is exclusive, so the lowest id seen is already excluded from
      // the next page; subtracting 1 would skip the transaction `minId - 1`.
      fromId = Math.min(...page_.map((t) => t.transaction_id));
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    recordEsiActivity('getCharacterWalletTransactions', characterId, outcomeForError(err));
    throw err;
  }
  recordEsiActivity('getCharacterWalletTransactions', characterId, 'success');
  return { items, truncated };
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

/**
 * A character's asset list can run into the tens of thousands of rows
 * (BPO libraries, PI, hangars scattered across many stations). Past this
 * many pages, further fetching costs more in ESI round trips than the view
 * can usefully render — stop and report the cut rather than fetch forever.
 */
const MAX_ASSET_PAGES = 25;

/**
 * Paginated (X-Pages), capped at MAX_ASSET_PAGES; see fetchAllPagesStatus.
 * `truncated` covers both the cap and a short read, so a partial list never
 * reaches the view looking whole.
 */
export function getCharacterAssets(
  characterId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<CharacterAsset>> {
  return fetchAllPagesStatus<CharacterAsset>(`/characters/${characterId}/assets`, {
    ...options,
    characterId,
    endpointId: 'getCharacterAssets',
    maxPages: MAX_ASSET_PAGES,
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
  return esiFetch<UniverseStation>(`/universe/stations/${stationId}`, {
    ...options,
    endpointId: 'getUniverseStation',
  });
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
    endpointId: 'getCharacterMailHeaders',
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
    endpointId: 'getCharacterMail',
  });
}

// --- GET /markets/prices (public) ---

export interface MarketPrice {
  type_id: number;
  adjusted_price?: number;
  average_price?: number;
}

/** Global market prices — fallback price source and EIV input (ADR 0002). */
export function getMarketsPrices(options: EndpointOptions = {}): Promise<EsiResult<MarketPrice[]>> {
  return esiFetch<MarketPrice[]>('/markets/prices', {
    ...options,
    endpointId: 'getMarketsPrices',
  });
}

// --- GET /markets/{region_id}/orders (public) ---

export interface RegionOrder {
  duration: number;
  is_buy_order: boolean;
  issued: string;
  location_id: number;
  min_volume: number;
  order_id: number;
  price: number;
  range: string;
  system_id: number;
  type_id: number;
  volume_remain: number;
  volume_total: number;
}

/**
 * Every buy/sell order for one item in one region (ADR 0003), paginated
 * (X-Pages) though a single item rarely exceeds one page — Tritanium in The
 * Forge, the busiest region, measured 158 orders / 1 page (verified 2026-08-30).
 */
export function getMarketOrders(
  regionId: number,
  typeId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<RegionOrder>> {
  return fetchAllPagesStatus<RegionOrder>(`/markets/${regionId}/orders`, {
    ...options,
    endpointId: 'getMarketOrders',
    query: { order_type: 'all', type_id: typeId },
  });
}

// --- GET /markets/{region_id}/history (public) ---

export interface MarketHistoryEntry {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  order_count: number;
  volume: number;
}

/** One item's daily market history for a region — average/high/low price and traded volume, not paginated. */
export function getMarketHistory(
  regionId: number,
  typeId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MarketHistoryEntry[]>> {
  return esiFetch<MarketHistoryEntry[]>(`/markets/${regionId}/history`, {
    ...options,
    endpointId: 'getMarketHistory',
    query: { type_id: typeId },
  });
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
  if (ids.length === 0) return [];
  const result = await esiFetch<UniverseName[]>('/universe/names', {
    method: 'POST',
    body: ids,
    signal: options.signal,
    endpointId: 'postUniverseNames',
  });
  return result.data ?? [];
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
    endpointId: 'getCharacterCalendar',
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
    endpointId: 'getCharacterCalendarEvent',
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

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCharacterContracts(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<Contract>> {
  return fetchAllPagesStatus<Contract>(`/characters/${characterId}/contracts`, {
    ...options,
    characterId,
    endpointId: 'getCharacterContracts',
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
    endpointId: 'getCharacterOrders',
  });
}

// --- GET /characters/{character_id}/orders/history (esi-markets.read_character_orders.v1) ---

export interface MarketOrderHistory extends MarketOrder {
  state: 'cancelled' | 'expired';
}

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCharacterOrderHistory(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<MarketOrderHistory>> {
  return fetchAllPagesStatus<MarketOrderHistory>(`/characters/${characterId}/orders/history`, {
    ...options,
    characterId,
    endpointId: 'getCharacterOrderHistory',
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
  return esiFetch<CharacterClones>(`/characters/${characterId}/clones`, {
    ...options,
    characterId,
    endpointId: 'getCharacterClones',
  });
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

// --- GET /characters/{character_id}/planets (esi-planets.manage_planets.v1) ---

export interface CharacterPlanet {
  solar_system_id: number;
  planet_id: number;
  planet_type: 'temperate' | 'barren' | 'oceanic' | 'ice' | 'gas' | 'lava' | 'storm' | 'plasma';
  owner_id: number;
  last_update: string;
  upgrade_level: number;
  num_pins: number;
}

export function getCharacterPlanets(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterPlanet[]>> {
  return esiFetch<CharacterPlanet[]>(`/characters/${characterId}/planets`, {
    ...options,
    characterId,
    endpointId: 'getCharacterPlanets',
  });
}

// --- GET /characters/{character_id}/planets/{planet_id} (esi-planets.manage_planets.v1) ---

/**
 * Optionality is aggressive here (spec-verified): `pins[]` requires only
 * `pin_id, type_id, latitude, longitude`; `expiry_time`, `install_time`,
 * `last_cycle_start` and `schematic_id` are all optional, and
 * `extractor_details` itself requires only `heads`. Never assume a field is
 * present — `features/pi/adapters.ts` excludes a pin from the colony-health
 * math rather than substituting a default.
 */
export interface PlanetPinExtractorDetails {
  heads: { head_id: number; latitude: number; longitude: number }[];
  cycle_time?: number;
  head_radius?: number;
  product_type_id?: number;
  qty_per_cycle?: number;
}

export interface PlanetPinFactoryDetails {
  schematic_id: number;
}

export interface PlanetPin {
  pin_id: number;
  type_id: number;
  latitude: number;
  longitude: number;
  schematic_id?: number;
  install_time?: string;
  /** Fixed at install; does not drift without the colony being opened in-client. Trustworthy. */
  expiry_time?: string;
  /** Only recalculated when the colony is opened in-client. Not trustworthy for "is this idle" math. */
  last_cycle_start?: string;
  /** Current stored amount — same in-client-only staleness as last_cycle_start. Not trustworthy. */
  contents?: { type_id: number; amount: number }[];
  extractor_details?: PlanetPinExtractorDetails;
  factory_details?: PlanetPinFactoryDetails;
}

export interface PlanetLink {
  source_pin_id: number;
  destination_pin_id: number;
  link_level: number;
}

export interface PlanetRoute {
  route_id: number;
  source_pin_id: number;
  destination_pin_id: number;
  content_type_id: number;
  quantity: number;
  waypoints?: number[];
}

export interface CharacterPlanetDetail {
  links: PlanetLink[];
  pins: PlanetPin[];
  routes: PlanetRoute[];
}

export function getCharacterPlanet(
  characterId: number,
  planetId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<CharacterPlanetDetail>> {
  return esiFetch<CharacterPlanetDetail>(`/characters/${characterId}/planets/${planetId}`, {
    ...options,
    characterId,
    endpointId: 'getCharacterPlanet',
  });
}

// --- GET /universe/planets/{planet_id} (public) ---

export interface UniversePlanet {
  planet_id: number;
  name: string;
  system_id: number;
  type_id: number;
  position: { x: number; y: number; z: number };
}

export function getUniversePlanet(
  planetId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniversePlanet>> {
  return esiFetch<UniversePlanet>(`/universe/planets/${planetId}`, {
    ...options,
    endpointId: 'getUniversePlanet',
  });
}

// --- GET /universe/schematics/{schematic_id} (public) ---

/** Spec-verified: no inputs/outputs/quantities, just the name and cycle time. */
export interface UniverseSchematic {
  schematic_name: string;
  cycle_time: number;
}

export function getUniverseSchematic(
  schematicId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<UniverseSchematic>> {
  return esiFetch<UniverseSchematic>(`/universe/schematics/${schematicId}`, {
    ...options,
    endpointId: 'getUniverseSchematic',
  });
}

// --- GET /characters/{character_id}/contacts (esi-characters.read_contacts.v1) ---

export interface CharacterContact {
  contact_id: number;
  contact_type: 'character' | 'corporation' | 'alliance' | 'faction';
  standing: number;
  is_blocked?: boolean;
  is_watched?: boolean;
  label_ids?: number[];
}

/** Paginated (X-Pages); see fetchAllPagesStatus. */
export function getCharacterContacts(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<CharacterContact>> {
  return fetchAllPagesStatus<CharacterContact>(`/characters/${characterId}/contacts`, {
    ...options,
    characterId,
    endpointId: 'getCharacterContacts',
  });
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
  return esiFetch<CharacterLoyaltyPoints[]>(`/characters/${characterId}/loyalty/points`, {
    ...options,
    characterId,
    endpointId: 'getCharacterLoyaltyPoints',
  });
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
  return esiFetch<CharacterLocation>(`/characters/${characterId}/location`, {
    ...options,
    characterId,
    endpointId: 'getCharacterLocation',
  });
}

// --- GET /route/{origin}/{destination} (public) ---

export interface RouteOptions extends EndpointOptions {
  /**
   * ESI's real route-preference enum — verified live against
   * `GET /route/{origin}/{destination}/`: `shortest`/`secure`/`insecure` are
   * accepted, `fastest`/`safest` both 400. `secure` prefers highsec systems
   * (the "Safest" choice issue #87's UI surfaces); `insecure` has no UI use
   * today but is included so this wrapper reflects the endpoint it wraps.
   */
  flag?: 'shortest' | 'secure' | 'insecure';
}

/** Waypoint solar-system ids, including both origin and destination. */
export function getRoute(
  origin: number,
  destination: number,
  options: RouteOptions = {}
): Promise<EsiResult<number[]>> {
  const { flag, ...rest } = options;
  return esiFetch<number[]>(`/route/${origin}/${destination}`, {
    ...rest,
    endpointId: 'getRoute',
    query: { flag },
  });
}
