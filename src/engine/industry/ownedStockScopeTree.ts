/**
 * The nested station → hangar / container tree behind the owned-stock scope
 * picker (issue #2941), and the selection rules that go with it. Pure: the
 * picker only draws what `buildScopeTree` returns and calls the `toggle*`
 * helpers, so the rules are tested here rather than through a popover.
 *
 * A station is selected whole (`locations`) or narrowed to hangar divisions /
 * containers (`hangars` / `containers`). A whole station can still carry the
 * legacy `excludedContainers` (issue #2869), which shows as a partial state.
 */

import {
  ownedStockLocationKey,
  type DetectedOwnedStockMap,
  type OwnedStockLocation,
  type OwnedStockScope,
} from './ownedStock';

export interface ScopeTreeContainer {
  containerId: number;
  typeId: number;
  /** Corp hangar division the container sits in, when known. */
  hangar?: number;
}

export interface ScopeTreeStation {
  key: string;
  location: OwnedStockLocation;
  /** Corp hangar divisions holding stock here, ascending. Empty for personal stock. */
  hangars: number[];
  containers: ScopeTreeContainer[];
}

export type ScopeCheckState = 'checked' | 'partial' | 'empty';

type SelectedScope = Extract<OwnedStockScope, { mode: 'selected' }>;

/** Every station holding detected stock, with the hangars and containers under it. */
export function buildScopeTree(stock: DetectedOwnedStockMap): ScopeTreeStation[] {
  const stations = new Map<string, ScopeTreeStation>();
  for (const entry of stock.values()) {
    for (const p of entry.placements) {
      const key = ownedStockLocationKey(p);
      let station = stations.get(key);
      if (!station) {
        station = {
          key,
          location: {
            characterId: p.characterId,
            ...(p.corporationId !== undefined ? { corporationId: p.corporationId } : {}),
            locationId: p.locationId,
            locationType: p.locationType,
          },
          hangars: [],
          containers: [],
        };
        stations.set(key, station);
      }
      for (const h of p.hangars ?? []) {
        if (!station.hangars.includes(h.division)) station.hangars.push(h.division);
      }
      for (const c of p.containers ?? []) {
        if (station.containers.some((x) => x.containerId === c.containerId)) continue;
        station.containers.push({
          containerId: c.containerId,
          typeId: c.typeId,
          ...(c.hangar !== undefined ? { hangar: c.hangar } : {}),
        });
      }
    }
  }
  for (const s of stations.values()) {
    s.hangars.sort((a, b) => a - b);
    s.containers.sort((a, b) => a.containerId - b.containerId);
  }
  return [...stations.values()];
}

function asSelected(scope: OwnedStockScope | undefined): SelectedScope {
  return scope?.mode === 'selected' ? scope : { mode: 'selected', locations: [] };
}

function isWhole(scope: SelectedScope, station: ScopeTreeStation): boolean {
  return scope.locations.some((l) => ownedStockLocationKey(l) === station.key);
}

function hasHangar(scope: SelectedScope, station: ScopeTreeStation, division: number): boolean {
  return (scope.hangars ?? []).some(
    (h) => h.division === division && ownedStockLocationKey(h) === station.key
  );
}

export function isHangarChecked(
  scope: OwnedStockScope | undefined,
  station: ScopeTreeStation,
  division: number
): boolean {
  const s = asSelected(scope);
  return isWhole(s, station) || hasHangar(s, station, division);
}

export function isContainerChecked(
  scope: OwnedStockScope | undefined,
  station: ScopeTreeStation,
  container: ScopeTreeContainer
): boolean {
  const s = asSelected(scope);
  if (isWhole(s, station)) return !(s.excludedContainers ?? []).includes(container.containerId);
  return (
    (s.containers ?? []).includes(container.containerId) ||
    (container.hangar !== undefined && hasHangar(s, station, container.hangar))
  );
}

export function stationState(
  scope: OwnedStockScope | undefined,
  station: ScopeTreeStation
): ScopeCheckState {
  const s = asSelected(scope);
  const hangarStates = station.hangars.map((d) => isHangarChecked(s, station, d));
  const containerStates = station.containers.map((c) => isContainerChecked(s, station, c));
  const children = [...hangarStates, ...containerStates];
  if (isWhole(s, station)) return children.every(Boolean) ? 'checked' : 'partial';
  return children.some(Boolean) ? 'partial' : 'empty';
}

function withoutStation(scope: SelectedScope, station: ScopeTreeStation): SelectedScope {
  const containerIds = new Set(station.containers.map((c) => c.containerId));
  return build(
    scope.locations.filter((l) => ownedStockLocationKey(l) !== station.key),
    (scope.hangars ?? []).filter((h) => ownedStockLocationKey(h) !== station.key),
    (scope.containers ?? []).filter((id) => !containerIds.has(id)),
    (scope.excludedContainers ?? []).filter((id) => !containerIds.has(id))
  );
}

function build(
  locations: SelectedScope['locations'],
  hangars: NonNullable<SelectedScope['hangars']>,
  containers: readonly number[],
  excludedContainers: readonly number[]
): SelectedScope {
  return {
    mode: 'selected',
    locations,
    ...(hangars.length > 0 ? { hangars } : {}),
    ...(containers.length > 0 ? { containers } : {}),
    ...(excludedContainers.length > 0 ? { excludedContainers } : {}),
  };
}

/** Checked → cleared; partial or empty → the whole station, everything under it. */
export function toggleStation(
  scope: OwnedStockScope | undefined,
  station: ScopeTreeStation
): SelectedScope {
  const s = asSelected(scope);
  const cleared = withoutStation(s, station);
  if (stationState(s, station) === 'checked') return cleared;
  return { ...cleared, locations: [...cleared.locations, station.location] };
}

export function toggleContainer(
  scope: OwnedStockScope | undefined,
  station: ScopeTreeStation,
  containerId: number
): SelectedScope {
  const s = asSelected(scope);
  const toggled = (ids: readonly number[] | undefined) =>
    (ids ?? []).includes(containerId)
      ? (ids ?? []).filter((id) => id !== containerId)
      : [...(ids ?? []), containerId];
  if (isWhole(s, station)) {
    return build(s.locations, s.hangars ?? [], s.containers ?? [], toggled(s.excludedContainers));
  }
  return build(s.locations, s.hangars ?? [], toggled(s.containers), s.excludedContainers ?? []);
}

/**
 * Unchecking a hangar under a whole station narrows the station to the other
 * hangars (and the containers outside this one): a whole station cannot say
 * "all but one division" any other way.
 */
export function toggleHangar(
  scope: OwnedStockScope | undefined,
  station: ScopeTreeStation,
  division: number
): SelectedScope {
  const s = asSelected(scope);
  const here = (d: number): { division: number } & OwnedStockLocation => ({
    ...station.location,
    division: d,
  });
  if (isWhole(s, station)) {
    const excluded = new Set(s.excludedContainers ?? []);
    const narrowed = withoutStation(s, station);
    return build(
      narrowed.locations,
      [...(narrowed.hangars ?? []), ...station.hangars.filter((d) => d !== division).map(here)],
      [
        ...(narrowed.containers ?? []),
        ...station.containers
          .filter((c) => c.hangar !== division && !excluded.has(c.containerId))
          .map((c) => c.containerId),
      ],
      []
    );
  }
  const others = (s.hangars ?? []).filter(
    (h) => !(h.division === division && ownedStockLocationKey(h) === station.key)
  );
  return build(
    s.locations,
    hasHangar(s, station, division) ? others : [...others, here(division)],
    s.containers ?? [],
    s.excludedContainers ?? []
  );
}
