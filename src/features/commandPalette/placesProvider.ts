import { rankedSearch } from '@/lib/rankedSearch';
import { classifyPlaceId } from '@/features/places/classify';
import type { FoundPlace } from '@/features/places/useKnownPlaces';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import {
  GROUP_LIMIT,
  type PaletteAltOutcome,
  type PaletteProvider,
  type PaletteResult,
} from './types';

export interface PlacesProviderOptions {
  loadSystems(): Promise<readonly SolarSystemEntry[]>;
  searchPlaces(query: string, limit: number): Promise<readonly FoundPlace[]>;
  nicknames(): Readonly<Record<number, string>>;
  resolvePlace(locationId: number): Promise<{ name: string; systemId: number } | null>;
  openRoute(systemId: number, stationId: number | null): void;
  setWaypoint(locationId: number, placeName: string): Promise<PaletteAltOutcome>;
  waypointLabel: string;
  describeSystem(system: SolarSystemEntry): string;
  describeStation(place: { name: string; systemName: string | null }, nickname?: string): string;
}

interface PlaceRow {
  id: number;
  label: string;
  name: string;
  nickname: string | undefined;
  systemId: number;
  kind: 'station' | 'structure';
}

const STATION_MIN_QUERY_LENGTH = 4;
const STATION_FETCH_LIMIT = GROUP_LIMIT * 8;

export function createPlacesProvider(options: PlacesProviderOptions): PaletteProvider {
  return {
    id: 'places',
    labelKey: 'commandPalette.groups.places',
    order: 4,
    minQueryLength: 2,
    async search(query) {
      const nicknames = options.nicknames();
      const wantStations = query.trim().length >= STATION_MIN_QUERY_LENGTH;
      const [systems, searched, nicknamed] = await Promise.all([
        options.loadSystems(),
        wantStations ? options.searchPlaces(query, STATION_FETCH_LIMIT) : Promise.resolve([]),
        resolveNicknamed(query, nicknames, options),
      ]);
      const prefix = query.trim().toLowerCase();
      const found = searched.filter(
        (place) => place.kind === 'structure' || place.name.toLowerCase().startsWith(prefix)
      );
      const systemById = new Map(systems.map((system) => [system.id, system]));

      const rows = new Map<number, PlaceRow>();
      for (const place of found) {
        const nickname = nicknames[place.id];
        rows.set(place.id, {
          id: place.id,
          label: nickname ?? place.name,
          name: place.name,
          nickname,
          systemId: place.systemId,
          kind: place.kind,
        });
      }
      for (const place of nicknamed) if (!rows.has(place.id)) rows.set(place.id, place);

      const systemResults = rankedSearch(systems, query, {
        primary: (system) => system.name,
        ignoreSeparators: true,
        limit: GROUP_LIMIT,
      }).map((system): PaletteResult => ({
        id: `system:${system.id}`,
        label: system.name,
        sublabel: options.describeSystem(system),
        run: () => options.openRoute(system.id, null),
        altAction: {
          label: options.waypointLabel,
          run: () => options.setWaypoint(system.id, system.name),
        },
      }));
      const placeResults = [...rows.values()].map((place): PaletteResult => ({
        id: `${place.kind}:${place.id}`,
        label: place.label,
        sublabel: options.describeStation(
          { name: place.name, systemName: systemById.get(place.systemId)?.name ?? null },
          place.nickname
        ),
        run: () => options.openRoute(place.systemId, place.id),
        altAction: {
          label: options.waypointLabel,
          run: () => options.setWaypoint(place.id, place.name),
        },
      }));
      return [...systemResults, ...placeResults].slice(0, GROUP_LIMIT);
    },
  };
}

async function resolveNicknamed(
  query: string,
  nicknames: Readonly<Record<number, string>>,
  options: PlacesProviderOptions
): Promise<PlaceRow[]> {
  const entries = Object.entries(nicknames).map(([id, nickname]) => ({ id: Number(id), nickname }));
  if (entries.length === 0) return [];
  const hits = rankedSearch(entries, query, { primary: (e) => e.nickname, limit: GROUP_LIMIT });
  const resolved = await Promise.all(
    hits.map(async (hit): Promise<PlaceRow | null> => {
      const place = await options.resolvePlace(hit.id);
      if (!place) return null;
      return {
        id: hit.id,
        label: hit.nickname,
        name: place.name,
        nickname: hit.nickname,
        systemId: place.systemId,
        kind: classifyPlaceId(hit.id) === 'structure' ? 'structure' : 'station',
      };
    })
  );
  return resolved.filter((row) => row !== null);
}
