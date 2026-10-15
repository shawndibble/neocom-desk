/**
 * Where a Community Request is, read from its location text (issue #3811).
 * The text stays free (a Request stores it as typed), but compose offers
 * systems and regions to pick, which write "System, Region" or "Region
 * (region)". Anything that reads back as one of those can be measured in
 * jumps; anything else (an older Request, a typed note) is simply not
 * measurable, which the board says rather than hides. Pure: the SDE snapshot
 * is passed in as plain lists.
 */

export interface PlaceSystem {
  id: number;
  name: string;
  regionId: number;
}

export interface PlaceRegion {
  id: number;
  name: string;
}

export interface PlaceIndex {
  systemsByName: ReadonlyMap<string, PlaceSystem>;
  regionsByName: ReadonlyMap<string, PlaceRegion>;
  regionsById: ReadonlyMap<number, PlaceRegion>;
  systemsOfRegion: ReadonlyMap<number, readonly number[]>;
}

export type Place = { kind: 'system'; systemId: number } | { kind: 'region'; regionId: number };

const REGION_SUFFIX = / \(region\)$/i;

export function buildPlaceIndex(
  systems: readonly PlaceSystem[],
  regions: readonly PlaceRegion[]
): PlaceIndex {
  const systemsByName = new Map<string, PlaceSystem>();
  const systemsOfRegion = new Map<number, number[]>();
  for (const system of systems) {
    systemsByName.set(system.name.toLowerCase(), system);
    const list = systemsOfRegion.get(system.regionId) ?? [];
    list.push(system.id);
    systemsOfRegion.set(system.regionId, list);
  }
  return {
    systemsByName,
    regionsByName: new Map(regions.map((r) => [r.name.toLowerCase(), r])),
    regionsById: new Map(regions.map((r) => [r.id, r])),
    systemsOfRegion,
  };
}

/** What a system writes into the location field: its name and its region. */
export function systemPlaceText(system: PlaceSystem, regionName: string | undefined): string {
  return regionName ? `${system.name}, ${regionName}` : system.name;
}

export function regionPlaceText(name: string): string {
  return `${name} (region)`;
}

/** The system or region a location text names, or null when it names neither. */
export function resolvePlace(text: string, index: PlaceIndex): Place | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (REGION_SUFFIX.test(trimmed)) {
    const region = index.regionsByName.get(trimmed.replace(REGION_SUFFIX, '').trim().toLowerCase());
    return region ? { kind: 'region', regionId: region.id } : null;
  }
  const first = trimmed.split(',')[0].trim().toLowerCase();
  const system = index.systemsByName.get(first);
  if (system) return { kind: 'system', systemId: system.id };
  const region = index.regionsByName.get(trimmed.toLowerCase());
  return region ? { kind: 'region', regionId: region.id } : null;
}

export interface PlaceSuggestion {
  /** What goes in the location field. */
  text: string;
  kind: Place['kind'];
}

/** Systems and regions whose name starts with, or else contains, the query; shortest names first. */
export function searchPlaces(query: string, index: PlaceIndex, limit: number): PlaceSuggestion[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [];
  const rank = (name: string) => {
    const at = name.toLowerCase().indexOf(needle);
    return at === -1 ? null : at === 0 ? 0 : 1;
  };
  const found: { text: string; kind: Place['kind']; name: string; rank: number }[] = [];
  for (const system of index.systemsByName.values()) {
    const r = rank(system.name);
    if (r !== null) {
      found.push({
        text: systemPlaceText(system, index.regionsById.get(system.regionId)?.name),
        kind: 'system',
        name: system.name,
        rank: r,
      });
    }
  }
  for (const region of index.regionsByName.values()) {
    const r = rank(region.name);
    if (r !== null) {
      found.push({
        text: regionPlaceText(region.name),
        kind: 'region',
        name: region.name,
        rank: r,
      });
    }
  }
  return found
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.name.length - b.name.length ||
        Number(a.kind === 'region') - Number(b.kind === 'region') ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit)
    .map(({ text, kind }) => ({ text, kind }));
}

/**
 * Jumps from where the pilot is (`distances`: jumps to every reachable system)
 * to a place: a system's own distance, or the nearest reachable system of a
 * region. Null when none of it can be reached by stargate.
 */
export function jumpsToPlace(
  place: Place,
  distances: ReadonlyMap<number, number>,
  index: PlaceIndex
): number | null {
  if (place.kind === 'system') return distances.get(place.systemId) ?? null;
  let nearest: number | null = null;
  for (const systemId of index.systemsOfRegion.get(place.regionId) ?? []) {
    const jumps = distances.get(systemId);
    if (jumps !== undefined && (nearest === null || jumps < nearest)) nearest = jumps;
  }
  return nearest;
}
