import { isNpcStationId, UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import type { PlaceKind, PlaceRef } from './types';

function isSolarSystemId(id: number): boolean {
  return id >= 30_000_000 && id < 33_000_000;
}

export function classifyPlaceId(locationId: number): PlaceKind | null {
  if (isSolarSystemId(locationId)) return 'solar_system';
  if (isNpcStationId(locationId)) return 'station';
  if (locationId >= UPWELL_STRUCTURE_ID_FLOOR) return 'structure';
  return null;
}

function isRegionId(id: number): boolean {
  return id >= 10_000_000 && id < 20_000_000;
}

export type PlaceInfoKind = PlaceKind | 'region';

export function classifyPlaceInfoId(id: number): PlaceInfoKind | null {
  return isRegionId(id) ? 'region' : classifyPlaceId(id);
}

export function placeKindOf(ref: Pick<PlaceRef, 'locationId' | 'kind'>): PlaceKind | null {
  return ref.kind ?? classifyPlaceId(ref.locationId);
}

export function placeKey(ref: Pick<PlaceRef, 'locationId' | 'characterId'>): string {
  return `${ref.characterId ?? ''}:${ref.locationId}`;
}
