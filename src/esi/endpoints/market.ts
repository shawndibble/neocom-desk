import { characterGet, characterPages } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult, TruncatableResult } from '../paginated';
import type { EndpointOptions } from './options';

export interface MarketPrice {
  type_id: number;
  adjusted_price?: number;
  average_price?: number;
}

export function getMarketsPrices(options: EndpointOptions = {}): Promise<EsiResult<MarketPrice[]>> {
  return esiFetch<MarketPrice[]>('/markets/prices', {
    ...options,
    endpointId: 'getMarketsPrices',
  });
}

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

export function getMarketTypes(
  regionId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<number>> {
  return fetchAllPagesStatus<number>(`/markets/${regionId}/types`, {
    ...options,
    endpointId: 'getMarketTypes',
  });
}

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

export interface MarketHistoryEntry {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  order_count: number;
  volume: number;
}

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

export function getCharacterOrders(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MarketOrder[]>> {
  return characterGet<MarketOrder[]>('getCharacterOrders', characterId, options);
}

export interface CorporationOrder {
  order_id: number;
  type_id: number;
  region_id: number;
  location_id: number;
  is_buy_order?: boolean;
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

export interface MarketOrderHistory extends MarketOrder {
  state: 'cancelled' | 'expired';
}

export function getCharacterOrderHistory(
  characterId: number,
  options: EndpointOptions = {}
): Promise<TruncatableResult<MarketOrderHistory>> {
  return characterPages<MarketOrderHistory>('getCharacterOrderHistory', characterId, options);
}
