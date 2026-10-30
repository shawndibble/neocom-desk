import { describe, expect, it } from 'vitest';
import { matchAssets } from './assetsLogic';
import type { CharacterAsset } from '@/esi/endpoints';

const asset = (item_id: number, type_id: number): CharacterAsset => ({
  item_id,
  type_id,
  quantity: 1,
  location_id: 60003760,
  location_type: 'station',
  location_flag: 'Hangar',
  is_singleton: true,
});

describe('matchAssets', () => {
  const assets = [asset(1, 10), asset(2, 10), asset(3, 20)];
  const typeNames = new Map([
    [10, 'Station Container'],
    [20, 'Tritanium'],
  ]);

  it('finds an item by its in-game name and carries the name on the match', () => {
    const matches = matchAssets(assets, typeNames, 'doctrine', { 1: 'Doctrine Ferox stock' });
    expect(matches).toEqual([
      { asset: assets[0], name: 'Station Container', gameName: 'Doctrine Ferox stock' },
    ]);
  });

  it('still matches the type name, and leaves unnamed matches without a gameName', () => {
    const matches = matchAssets(assets, typeNames, 'container', { 1: 'Loot' });
    expect(matches.map((m) => m.asset.item_id)).toEqual([1, 2]);
    expect(matches[1]).not.toHaveProperty('gameName');
  });

  it('returns everything for an empty query', () => {
    expect(matchAssets(assets, typeNames, '')).toHaveLength(3);
  });
});
