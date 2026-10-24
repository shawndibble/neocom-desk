/**
 * The rows of a system picker that also finds stations (issue #4964): the
 * ranked systems, then the stations and structures beside them, one list.
 */
import { rankedSearch } from '@/lib/rankedSearch';
import type { FoundPlace } from '@/features/places/useKnownPlaces';
import type { PickedStation } from '@/features/places/placeSearch';
import type { SolarSystemEntry } from '@/sde/marketTypes';

export interface PickerOption {
  key: string;
  kind: 'system' | 'station' | 'structure';
  name: string;
  systemId: number;
  security: number | null;
  stationId: number | null;
}

export function buildPickerOptions(
  systems: readonly SolarSystemEntry[],
  query: string,
  exclude: ReadonlySet<number> | undefined,
  placeHits: readonly FoundPlace[],
  securityOf: (systemId: number) => number | null,
  limit: number
): PickerOption[] {
  const systemOptions = rankedSearch(
    exclude?.size ? systems.filter((system) => !exclude.has(system.id)) : systems,
    query,
    { primary: (system) => system.name, limit }
  ).map((system): PickerOption => ({
    key: `system:${system.id}`,
    kind: 'system',
    name: system.name,
    systemId: system.id,
    security: system.security,
    stationId: null,
  }));
  const placeOptions = placeHits
    .filter((place) => !exclude?.has(place.systemId))
    .map((place): PickerOption => ({
      key: `${place.kind}:${place.id}`,
      kind: place.kind,
      name: place.name,
      systemId: place.systemId,
      security: securityOf(place.systemId),
      stationId: place.id,
    }));
  return [...systemOptions, ...placeOptions];
}

/** What picking a row answers: its system, and the station when the row is one. */
export function pickedStationOf(option: PickerOption): PickedStation | undefined {
  return option.stationId === null ? undefined : { id: option.stationId, name: option.name };
}
