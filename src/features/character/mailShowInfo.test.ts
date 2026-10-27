import { describe, it, expect } from 'vitest';
import { itemKindOfGroup, resolveShowInfo } from './mailShowInfo';

describe('resolveShowInfo', () => {
  it('maps entity typeIDs to their kind', () => {
    expect(resolveShowInfo(1377, 90000001)).toEqual({ kind: 'character', id: 90000001 });
    expect(resolveShowInfo(2, 98000001)).toEqual({ kind: 'corporation', id: 98000001 });
    expect(resolveShowInfo(16159, 99000001)).toEqual({ kind: 'alliance', id: 99000001 });
  });

  it('opens a solar system by id block, whatever the typeID', () => {
    expect(resolveShowInfo(5, 30000142)).toEqual({ kind: 'system', id: 30000142 });
    expect(resolveShowInfo(0, 31000005)).toEqual({ kind: 'system', id: 31000005 });
  });

  it('opens a region, station or structure as a place', () => {
    expect(resolveShowInfo(3, 10000002)).toEqual({ kind: 'place', id: 10000002 });
    expect(resolveShowInfo(1529, 60003760)).toEqual({ kind: 'place', id: 60003760 });
    expect(resolveShowInfo(35832, 1_020_000_000_000)).toEqual({
      kind: 'place',
      id: 1_020_000_000_000,
    });
  });

  it('has no view for a constellation or faction', () => {
    expect(resolveShowInfo(4, 20000020)).toEqual({ kind: 'noView' });
    expect(resolveShowInfo(30, 500001)).toEqual({ kind: 'noView' });
  });

  it('treats a bare typeID, or an item instance, as an item type', () => {
    expect(resolveShowInfo(587, null)).toEqual({ kind: 'item', typeId: 587 });
    expect(resolveShowInfo(587, 1234567)).toEqual({ kind: 'item', typeId: 587 });
  });
});

describe('itemKindOfGroup', () => {
  const categories = { '255': 16, '25': 6, '18': 4 };
  it('tells skills and ships from other items by group category', () => {
    expect(itemKindOfGroup(255, categories)).toBe('skill');
    expect(itemKindOfGroup(25, categories)).toBe('ship');
    expect(itemKindOfGroup(18, categories)).toBe('item');
    expect(itemKindOfGroup(undefined, categories)).toBe('item');
    expect(itemKindOfGroup(999, categories)).toBe('item');
  });
});
