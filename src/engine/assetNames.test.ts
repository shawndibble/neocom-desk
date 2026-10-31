import { describe, expect, it } from 'vitest';
import { isNameableGroup, nameableItemIds, realAssetNames } from './assetNames';

describe('isNameableGroup', () => {
  it('accepts ships, deployables, structures and the container groups', () => {
    expect(isNameableGroup(25, 6)).toBe(true);
    expect(isNameableGroup(361, 22)).toBe(true);
    expect(isNameableGroup(1404, 65)).toBe(true);
    expect(isNameableGroup(12, 2)).toBe(true);
    expect(isNameableGroup(340, 2)).toBe(true);
  });

  it('rejects everything else, and an unknown group', () => {
    expect(isNameableGroup(18, 4)).toBe(false);
    expect(isNameableGroup(undefined, undefined)).toBe(false);
    expect(isNameableGroup(7, 2)).toBe(false);
  });
});

describe('nameableItemIds', () => {
  const nameable = (typeId: number) => typeId < 100;
  it('keeps only singleton items of nameable types, once each', () => {
    const ids = nameableItemIds(
      [
        { item_id: 1, type_id: 10, is_singleton: true },
        { item_id: 2, type_id: 10, is_singleton: false },
        { item_id: 3, type_id: 500, is_singleton: true },
        { item_id: 1, type_id: 10, is_singleton: true },
      ],
      nameable
    );
    expect(ids).toEqual([1]);
  });
});

describe('realAssetNames', () => {
  const typeIdByItemId = new Map([
    [1, 10],
    [2, 10],
    [3, 10],
    [4, 10],
  ]);
  const typeName = (typeId: number) => (typeId === 10 ? 'Station Container' : undefined);

  it('drops empty, None and type-echo placeholders and trims real names', () => {
    const names = realAssetNames(
      [
        { item_id: 1, name: '  Loot can ' },
        { item_id: 2, name: 'None' },
        { item_id: 3, name: 'Station Container' },
        { item_id: 4, name: '   ' },
      ],
      typeIdByItemId,
      typeName
    );
    expect(names).toEqual({ 1: 'Loot can' });
  });

  it('drops a name for an id it was not asked about', () => {
    expect(realAssetNames([{ item_id: 9, name: 'x' }], typeIdByItemId, typeName)).toEqual({});
  });
});
