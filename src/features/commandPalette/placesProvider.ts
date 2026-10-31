/**
 * The Command Palette's Places group (#5742): solar systems, NPC stations and
 * the structures this device already knows, found by name or by the pilot's
 * Place Nickname. Enter opens Route Safety there; Shift+Enter sets the
 * in-game waypoint.
 *
 * Local reads only, like the Assets group: the SDE snapshots, the structure
 * names `searchKnownPlaces` reads from Dexie, and the synced nicknames. Typing
 * never costs a request. A structure the active Character cannot see is
 * dropped, never guessed.
 */
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
  /** Stations and known structures matching the query, each with its system. */
  searchPlaces(query: string, limit: number): Promise<readonly FoundPlace[]>;
  /** Place Nickname by location id, read live. */
  nicknames(): Readonly<Record<number, string>>;
  /** A nicknamed place's real name and system, or null when it cannot be named. */
  resolvePlace(locationId: number): Promise<{ name: string; systemId: number } | null>;
  /** Route Safety to a system, naming the station when the row is one. */
  openRoute(systemId: number, stationId: number | null): void;
  /** Sets the in-game waypoint; the outcome is shown in the palette. */
  setWaypoint(locationId: number, placeName: string): Promise<PaletteAltOutcome>;
  waypointLabel: string;
  /** "0.9" style security for a system's sublabel. */
  describeSystem(system: SolarSystemEntry): string;
  describeStation(place: { name: string; systemName: string | null }, nickname?: string): string;
}

interface PlaceRow {
  id: number;
  /** What the row reads: the nickname when there is one, else the real name. */
  label: string;
  name: string;
  nickname: string | undefined;
  systemId: number;
  kind: 'station' | 'structure';
}

/** Stations and structures need a query this long, so a short word lists systems only. */
const STATION_MIN_QUERY_LENGTH = 4;
/** Candidates read before the prefix filter, so a real prefix hit is not cut by the row cap. */
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
      // An NPC station's name starts with its system's, so a broad word would
      // bury the systems under dozens of stations that merely mention it: only a
      // name the query is the start of counts. The few structures this device
      // knows are the pilot's own, so any word of their name finds them.
      const prefix = query.trim().toLowerCase();
      const found = searched.filter(
        (place) => place.kind === 'structure' || place.name.toLowerCase().startsWith(prefix)
      );
      const systemById = new Map(systems.map((system) => [system.id, system]));

      // One row per location id: a nickname hit and a name hit are the same place.
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

/** Places whose Place Nickname matches the query, resolved to a real name and system. */
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
