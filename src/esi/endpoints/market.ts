import { characterGet, characterPages } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult, TruncatableResult } from '../paginated';
import type { EndpointOptions } from './options';

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

// --- GET /markets/structures/{structure_id} (esi-markets.structure_markets.v1) ---

export interface StructureMarketOrder {
  duration: number;
  is_buy_order: boolean;
  issued: string;
  location_id: number;
  min_volume: number;
  order_id: number;
  price: number;
  range: string;
  type_id: number;
  volume_remain: number;
  volume_total: number;
}

/**
 * Every buy/sell order for every item inside one player structure (issue
 * #538) — unlike `getMarketOrders`, this cannot be filtered by `type_id`, so
 * a caller wanting one item's competition must filter `items` itself. ACL
 * per structure (ESI: 403 for anyone off the ACL, regardless of scope), and
 * paginated (X-Pages); a busy trade tower can run to many pages.
 */
export function getStructureMarketOrders(
  characterId: number,
  structureId: number,
  options: EndpointOptions = {}
): Promise<PaginatedResult<StructureMarketOrder>> {
  return fetchAllPagesStatus<StructureMarketOrder>(`/markets/structures/${structureId}`, {
    ...options,
    characterId,
    endpointId: 'getStructureMarketOrders',
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
  return characterGet<MarketOrder[]>('getCharacterOrders', characterId, options);
}

// --- GET /corporations/{corporation_id}/orders (esi-markets.read_corporation_orders.v1) ---

/** A corporation's open order: ESI's character order shape plus who placed it. */
export interface CorporationOrder {
  order_id: number;
  type_id: number;
  region_id: number;
  location_id: number;
  is_buy_order?: boolean;
  /** The Character who issued the order. */
  issued_by?: number;
  price: number;
  volume_remain: number;
  volume_total: number;
  issued: string;
  duration: number;
  range: string;
  min_volume?: number;
  escrow?: number;
  wallet_division?: number;
}

/**
 * The corporation's open orders. Paginated (X-Pages), cached 1200s. Needs the
 * Accountant or Trader in-game role.
 */
export function getCorporationOrders(
  characterId: number,
  corporationId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<CorporationOrder>> {
  return fetchAllPagesStatus<CorporationOrder>(`/corporations/${corporationId}/orders`, {
    ...options,
    characterId,
    endpointId: 'getCorporationOrders',
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
  return characterPages<MarketOrderHistory>('getCharacterOrderHistory', characterId, options);
}
