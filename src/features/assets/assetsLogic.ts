import { type PinState } from '@/features/assets/stationPins';
import type { CharacterAsset } from '@/esi/endpoints';
import type { JumpsAwayResult } from '@/engine/clone/jumpsAway';
import {
  compareStations,
  type AssetTreeNode,
  type AssetTreeStation,
  type StationSortField,
} from '@/engine/assetTree';
import { type AssetSortField } from '@/features/assets/assetSortPreference';
import { type AssetMatch } from '@/features/assets/assetBrowseModel';

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export function locationLabel(
  locationId: number,
  locationType: CharacterAsset['location_type'],
  locationNames: ReadonlyMap<number, string>,
  assetsByItemId: Map<number, CharacterAsset>,
  typeNames: ReadonlyMap<number, string>,
  t: Translate
): string {
  if (locationType === 'station')
    return locationNames.get(locationId) ?? t('assets.stationLabel', { id: locationId });
  if (locationType === 'other')
    return locationNames.get(locationId) ?? t('assets.structureLabel', { id: locationId });
  if (locationType === 'solar_system') {
    const name = locationNames.get(locationId);
    return name
      ? t('assets.inSpaceNamedLabel', { name })
      : t('assets.inSpaceLabel', { id: locationId });
  }
  if (locationType === 'item') {
    // A missing parent is often actually a structure id ESI never returned as
    // its own asset row (a personal-hangar division inside a player-owned
    // structure, for instance) — `loadAssetsSnapshot` best-effort resolves
    // these via the structures endpoint, so a hit here beats every fallback
    // below.
    const resolvedName = locationNames.get(locationId);
    if (resolvedName) return resolvedName;
    // The parent is another asset (container or ship) in this same list; label
    // the group with ITS resolved type name instead of a raw item id.
    const parent = assetsByItemId.get(locationId);
    if (parent) {
      const parentName = typeNames.get(parent.type_id);
      if (parentName && parentName !== `Type #${parent.type_id}`) return parentName;
    }
    return t('assets.containerLabel');
  }
  // Exhaustiveness fallback: every current location_type is handled above.
  return t('assets.structureLabel', { id: locationId });
}

/** Name-substring search over a flat asset list, shared by the CSV export path and the on-screen results path. */
export function matchAssets(
  assets: readonly CharacterAsset[],
  typeNames: ReadonlyMap<number, string>,
  query: string
): AssetMatch[] {
  const q = query.trim().toLowerCase();
  const matches: AssetMatch[] = [];
  for (const asset of assets) {
    const name = typeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
    if (q && !name.toLowerCase().includes(q)) continue;
    matches.push({ asset, name });
  }
  return matches;
}

/** An `AssetMatch` with its estimated value precomputed once, rather than re-derived by every sort comparison. */
export interface ValuedAssetMatch {
  match: AssetMatch;
  value: number;
}

/** Orders the search/all-items flat list: name ascending, value and quantity highest-first. */
export function compareValuedAssetMatches(
  a: ValuedAssetMatch,
  b: ValuedAssetMatch,
  field: AssetSortField
): number {
  switch (field) {
    case 'name':
      return a.match.name.localeCompare(b.match.name);
    case 'value':
      return b.value - a.value;
    case 'quantity':
      return b.match.asset.quantity - a.match.asset.quantity;
  }
}

function nameForNode(node: AssetTreeNode, typeNames: ReadonlyMap<number, string>): string {
  if (node.kind === 'bay') return '';
  return typeNames.get(node.asset.type_id) ?? `Type #${node.asset.type_id}`;
}

/**
 * Bays stay in their fixed Cargo Hold / Drone Bay / Fitting order; every other sibling
 * list sorts by resolved display name, matching the flat list this tree replaces.
 */
function sortNodes(
  nodes: readonly AssetTreeNode[],
  typeNames: ReadonlyMap<number, string>
): AssetTreeNode[] {
  const bays: AssetTreeNode[] = [];
  const rest: AssetTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'bay') bays.push({ ...node, children: sortNodes(node.children, typeNames) });
    else if (node.kind === 'item') rest.push(node);
    else rest.push({ ...node, children: sortNodes(node.children, typeNames) });
  }
  rest.sort((a, b) => nameForNode(a, typeNames).localeCompare(nameForNode(b, typeNames)));
  return [...bays, ...rest];
}

/** Pinned stations (either scope) sort ahead of unpinned ones; each group orders by `sortField` (issue #88). */
export function sortStations(
  stations: readonly AssetTreeStation[],
  labelFor: (station: AssetTreeStation) => string,
  typeNames: ReadonlyMap<number, string>,
  pinStateFor: (station: AssetTreeStation) => PinState,
  sortField: StationSortField,
  jumpsAwayFor: (station: AssetTreeStation) => JumpsAwayResult | undefined
): AssetTreeStation[] {
  return [...stations]
    .map((station) => ({ ...station, children: sortNodes(station.children, typeNames) }))
    .sort((a, b) =>
      compareStations(a, b, sortField, {
        labelFor,
        pinnedFor: (station) => pinStateFor(station) !== 'unpinned',
        jumpsAwayFor,
      })
    );
}

/** An asset group's `location_type` as the kind a Place resolves under. */
export function placeKindForStation(
  locationType: AssetTreeStation['locationType']
): 'station' | 'solar_system' | 'structure' | undefined {
  if (locationType === 'station' || locationType === 'solar_system') return locationType;
  return locationType === 'other' || locationType === 'item' ? 'structure' : undefined;
}
