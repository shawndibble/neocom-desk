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
import type { Translate } from '@/lib/translate';
import { NO_ASSET_NAMES, type AssetNameMap } from '@/engine/assetNames';

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
    const resolvedName = locationNames.get(locationId);
    if (resolvedName) return resolvedName;
    const parent = assetsByItemId.get(locationId);
    if (parent) {
      const parentName = typeNames.get(parent.type_id);
      if (parentName && parentName !== `Type #${parent.type_id}`) return parentName;
    }
    return t('assets.containerLabel');
  }
  return t('assets.structureLabel', { id: locationId });
}

export function assetHolderChain(
  asset: CharacterAsset,
  assetsByItemId: ReadonlyMap<number, CharacterAsset>
): {
  chain: CharacterAsset[];
  rootLocationId: number;
  rootLocationType: CharacterAsset['location_type'];
  cyclic: boolean;
} {
  const chain: CharacterAsset[] = [];
  const seen = new Set([asset.item_id]);
  let current = asset;
  while (current.location_type === 'item') {
    const parent = assetsByItemId.get(current.location_id);
    if (!parent) break;
    if (seen.has(parent.item_id)) {
      return {
        chain,
        rootLocationId: current.location_id,
        rootLocationType: current.location_type,
        cyclic: true,
      };
    }
    chain.unshift(parent);
    seen.add(parent.item_id);
    current = parent;
  }
  return {
    chain,
    rootLocationId: current.location_id,
    rootLocationType: current.location_type,
    cyclic: false,
  };
}

export function matchAssets(
  assets: readonly CharacterAsset[],
  typeNames: ReadonlyMap<number, string>,
  query: string,
  assetNames: AssetNameMap = NO_ASSET_NAMES
): AssetMatch[] {
  const q = query.trim().toLowerCase();
  const matches: AssetMatch[] = [];
  for (const asset of assets) {
    const name = typeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
    const gameName = assetNames[asset.item_id];
    if (q && !name.toLowerCase().includes(q) && !gameName?.toLowerCase().includes(q)) continue;
    matches.push(gameName === undefined ? { asset, name } : { asset, name, gameName });
  }
  return matches;
}

export interface ValuedAssetMatch {
  match: AssetMatch;
  value: number;
}

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

export function placeKindForStation(
  locationType: AssetTreeStation['locationType']
): 'station' | 'solar_system' | 'structure' | undefined {
  if (locationType === 'station' || locationType === 'solar_system') return locationType;
  return locationType === 'other' || locationType === 'item' ? 'structure' : undefined;
}
