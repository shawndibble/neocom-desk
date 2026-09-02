import { describe, expect, it } from 'vitest';
import {
  assetNodeSegment,
  assetPathHref,
  parseAssetPath,
  resolveAssetPath,
  type ResolvedAssetPath,
} from './assetPath';
import type {
  AssetTreeBayNode,
  AssetTreeContainerNode,
  AssetTreeItemNode,
  AssetTreeStation,
  EngineAsset,
} from './assetTree';

function asset(itemId: number, overrides: Partial<EngineAsset> = {}): EngineAsset {
  return {
    item_id: itemId,
    type_id: 100 + itemId,
    quantity: 1,
    location_id: 60008494,
    location_type: 'station',
    location_flag: 'Hangar',
    ...overrides,
  };
}

function item(itemId: number): AssetTreeItemNode {
  return { kind: 'item', asset: asset(itemId) };
}

function bay(children: AssetTreeItemNode[]): AssetTreeBayNode {
  return { kind: 'bay', bay: 'cargoHold', children, itemCount: children.length, estimatedValue: 0 };
}

function ship(itemId: number, children: AssetTreeBayNode[]): AssetTreeContainerNode {
  return { kind: 'ship', asset: asset(itemId), children, itemCount: 1, estimatedValue: 0 };
}

const cargo = bay([item(31), item(32)]);
const slasher = ship(20, [cargo]);
const loose = item(21);
const station: AssetTreeStation = {
  locationId: 60008494,
  locationType: 'station',
  children: [slasher, loose],
  itemCount: 3,
  estimatedValue: 0,
};
const stations = [station];

describe('assetNodeSegment', () => {
  it('identifies a bay by its kind and an owned asset by its item id', () => {
    expect(assetNodeSegment(cargo)).toBe('b:cargoHold');
    expect(assetNodeSegment(slasher)).toBe('i:20');
    expect(assetNodeSegment(loose)).toBe('i:21');
  });
});

describe('resolveAssetPath', () => {
  it('lists nothing at the root, where the caller renders the location list instead', () => {
    expect(resolveAssetPath(stations, null, [])).toEqual<ResolvedAssetPath>({
      station: null,
      trail: [],
      children: [],
      unresolved: [],
    });
  });

  it('lists a station’s own children when the path stops at the station', () => {
    const resolved = resolveAssetPath(stations, 60008494, []);
    expect(resolved.station).toBe(station);
    expect(resolved.trail).toEqual([]);
    expect(resolved.children).toEqual([slasher, loose]);
    expect(resolved.unresolved).toEqual([]);
  });

  it('walks one segment into a container and lists its children', () => {
    const resolved = resolveAssetPath(stations, 60008494, ['i:20']);
    expect(resolved.trail).toEqual([slasher]);
    expect(resolved.children).toEqual([cargo]);
  });

  it('walks the full depth, keeping every node it passed through in the trail', () => {
    const resolved = resolveAssetPath(stations, 60008494, ['i:20', 'b:cargoHold']);
    expect(resolved.trail).toEqual([slasher, cargo]);
    expect(resolved.children).toEqual([item(31), item(32)]);
  });

  it('stops at a leaf: an item is a valid destination with nothing to list under it', () => {
    const resolved = resolveAssetPath(stations, 60008494, ['i:21']);
    expect(resolved.trail).toEqual([loose]);
    expect(resolved.children).toEqual([]);
    expect(resolved.unresolved).toEqual([]);
  });

  it('reports an unknown station id as unresolved rather than falling back to the root', () => {
    const resolved = resolveAssetPath(stations, 99999, ['i:20']);
    expect(resolved.station).toBeNull();
    expect(resolved.unresolved).toEqual(['99999', 'i:20']);
  });

  it('truncates at the deepest segment it can match and reports the rest', () => {
    const resolved = resolveAssetPath(stations, 60008494, ['i:20', 'b:droneBay', 'i:999']);
    expect(resolved.trail).toEqual([slasher]);
    expect(resolved.children).toEqual([cargo]);
    expect(resolved.unresolved).toEqual(['b:droneBay', 'i:999']);
  });

  it('treats segments past a leaf as unresolved — an item has nowhere to descend', () => {
    const resolved = resolveAssetPath(stations, 60008494, ['i:21', 'i:999']);
    expect(resolved.trail).toEqual([loose]);
    expect(resolved.unresolved).toEqual(['i:999']);
  });
});

describe('parseAssetPath', () => {
  it('reads the station id and the segments below it out of a wildcard match', () => {
    expect(parseAssetPath('60008494/i:20/b:cargoHold')).toEqual({
      stationId: 60008494,
      segments: ['i:20', 'b:cargoHold'],
    });
  });

  it('reads a bare station id', () => {
    expect(parseAssetPath('60008494')).toEqual({ stationId: 60008494, segments: [] });
  });

  it('reads the root, tolerating the empty string and stray slashes', () => {
    expect(parseAssetPath('')).toEqual({ stationId: null, segments: [] });
    expect(parseAssetPath('/')).toEqual({ stationId: null, segments: [] });
  });

  it('decodes percent-encoded segments', () => {
    expect(parseAssetPath('60008494/b%3AcargoHold')).toEqual({
      stationId: 60008494,
      segments: ['b:cargoHold'],
    });
  });

  it('rejects a non-numeric station id instead of coercing it to NaN', () => {
    expect(parseAssetPath('not-a-station/i:20')).toEqual({ stationId: null, segments: [] });
  });
});

describe('assetPathHref', () => {
  it('links to the root when there is no station', () => {
    expect(assetPathHref(null, [])).toBe('/assets');
  });

  it('links to a station and to a node below it', () => {
    expect(assetPathHref(60008494, [])).toBe('/assets/60008494');
    expect(assetPathHref(60008494, ['i:20', 'b:cargoHold'])).toBe(
      '/assets/60008494/i:20/b:cargoHold'
    );
  });
});
