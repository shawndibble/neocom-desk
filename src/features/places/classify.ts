/**
 * The one rule for "what is this location id", shared by every Place read.
 * Pure: id blocks only, no fetching.
 */
import { isNpcStationId, UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import type { PlaceKind, PlaceRef } from './types';

/** CCP's solar system id block: 30,000,000–32,999,999 (k-space, w-space, Abyssal). */
function isSolarSystemId(id: number): boolean {
  return id >= 30_000_000 && id < 33_000_000;
}

/** The kind an id's own block names, `null` for an id that is no place. */
export function classifyPlaceId(locationId: number): PlaceKind | null {
  if (isSolarSystemId(locationId)) return 'solar_system';
  if (isNpcStationId(locationId)) return 'station';
  if (locationId >= UPWELL_STRUCTURE_ID_FLOOR) return 'structure';
  return null;
}

/** CCP's region id block: 10,000,000–19,999,999 (k-space, w-space, Abyssal, void). */
function isRegionId(id: number): boolean {
  return id >= 10_000_000 && id < 20_000_000;
}

/** What Place Info can show: a Place, or a region. */
export type PlaceInfoKind = PlaceKind | 'region';

/** The kind Place Info shows for an id, `null` for an id it has no view of. */
export function classifyPlaceInfoId(id: number): PlaceInfoKind | null {
  return isRegionId(id) ? 'region' : classifyPlaceId(id);
}

/** What the caller said it is, else what the id says. */
export function placeKindOf(ref: Pick<PlaceRef, 'locationId' | 'kind'>): PlaceKind | null {
  return ref.kind ?? classifyPlaceId(ref.locationId);
}

/** Names a Place for one asker: the same structure can differ per Character. */
export function placeKey(ref: Pick<PlaceRef, 'locationId' | 'characterId'>): string {
  return `${ref.characterId ?? ''}:${ref.locationId}`;
}
