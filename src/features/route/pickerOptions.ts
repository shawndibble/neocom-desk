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
  limit: number
): PickerOption[] {
  const systemOptions = rankedSearch(
    exclude?.size ? systems.filter((system) => !exclude.has(system.id)) : systems,
    query,
    { primary: (system) => system.name, ignoreSeparators: true, limit }
  ).map((system): PickerOption => ({
    key: `system:${system.id}`,
    kind: 'system',
    name: system.name,
    systemId: system.id,
    security: system.security,
    stationId: null,
  }));
  const securityOf =
    placeHits.length > 0
      ? new Map(systems.map((system) => [system.id, system.security]))
      : new Map<number, number>();
  const placeOptions = placeHits
    .filter((place) => !exclude?.has(place.systemId))
    .map((place): PickerOption => ({
      key: `${place.kind}:${place.id}`,
      kind: place.kind,
      name: place.name,
      systemId: place.systemId,
      security: securityOf.get(place.systemId) ?? null,
      stationId: place.id,
    }));
  return [...systemOptions, ...placeOptions];
}

export function pickedStationOf(option: PickerOption): PickedStation | undefined {
  return option.stationId === null ? undefined : { id: option.stationId, name: option.name };
}
