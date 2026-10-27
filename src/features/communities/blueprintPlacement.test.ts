import { beforeEach, describe, expect, it, vi } from 'vitest';

const blueprints = vi.hoisted(() => ({ current: null as unknown }));
const assets = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/features/industry/data', () => ({
  loadCharacterBlueprints: async () => ({ cached: blueprints.current, needsReauth: false }),
}));
vi.mock('@/features/assets/assets', () => ({
  loadCharacterAssets: async () => ({ cached: assets.current, needsReauth: false }),
}));

import { loadPlacedBlueprints } from './blueprintPlacement';

const bp = (item_id: number, location_id: number, location_flag = 'Hangar') => ({
  item_id,
  type_id: 100,
  runs: -1,
  material_efficiency: 0,
  time_efficiency: 0,
  quantity: -1,
  location_id,
  location_flag,
});

beforeEach(() => {
  blueprints.current = { data: [bp(1, 60003760), bp(2, 9000, 'Unlocked')] };
  // Blueprint 2 sits in container 9000, which sits in a structure.
  assets.current = {
    data: [{ item_id: 9000, location_id: 1034000000001, location_type: 'other' }],
  };
});

describe('loadPlacedBlueprints', () => {
  it('places each copy at its station or structure, through containers', async () => {
    const placed = (await loadPlacedBlueprints(1))!;
    expect(placed.blueprints.map(placed.placeIdOf)).toEqual([60003760, 1034000000001]);
  });

  it('leaves a copy in an untraceable container unplaced', async () => {
    assets.current = { data: [] };
    const placed = (await loadPlacedBlueprints(1))!;
    expect(placed.placeIdOf({ item_id: 2 })).toBeNull();
  });

  it('is unavailable without cached assets, as the publish is', async () => {
    assets.current = null;
    expect(await loadPlacedBlueprints(1)).toBeNull();
  });
});
