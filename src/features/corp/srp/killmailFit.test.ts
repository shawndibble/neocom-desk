import { describe, expect, it } from 'vitest';
import type { DoctrineCheckRecord } from '../srpTypes';
import { fitGroups, offDoctrineCount, type FitItem } from './killmailFit';

const item = (type: number, flag: number, qty = 1): FitItem => ({
  item_type_id: type,
  flag,
  quantity_destroyed: qty,
});

const ITEMS: FitItem[] = [
  item(1, 27, 1), // high
  item(1, 28, 1), // high, same type
  item(2, 19), // mid
  item(3, 11), // low
  item(4, 92), // rig
  item(9, 87, 5), // drone bay
  item(8, 5, 100), // cargo: never shown
  item(7, 27, 0), // nothing lost
];

const off = (extraModules: number[], extraRigs: number[] = []): DoctrineCheckRecord => ({
  status: 'off-doctrine',
  diff: { missingModules: [], extraModules, missingRigs: [], extraRigs },
});

describe('fitGroups', () => {
  it('groups by slot, merges same types, and leaves cargo out', () => {
    const groups = fitGroups(ITEMS, undefined);
    expect(groups.map((g) => g.slot)).toEqual(['high', 'medium', 'low', 'rig', 'drone']);
    expect(groups[0]!.lines).toEqual([{ typeId: 1, count: 2, mark: null }]);
    expect(groups[4]!.lines).toEqual([{ typeId: 9, count: 5, mark: null }]);
  });

  it('marks no module when the hull is not checked', () => {
    const groups = fitGroups(ITEMS, { status: 'not-checked' });
    expect(groups.flatMap((g) => g.lines).every((l) => l.mark === null)).toBe(true);
  });

  it('marks a matched fit as doctrine, and never a drone', () => {
    const groups = fitGroups(ITEMS, { status: 'matched', doctrineId: 'd' });
    expect(groups[1]!.lines[0]!.mark).toBe('doctrine');
    expect(groups[3]!.lines[0]!.mark).toBe('doctrine');
    expect(groups[4]!.lines[0]!.mark).toBeNull();
  });

  it('marks the modules the diff calls extra as off doctrine, one by one', () => {
    const groups = fitGroups(ITEMS, off([1, 3], [4]));
    // two of type 1 fitted, one extra: the line splits into one off and one doctrine
    expect(groups[0]!.lines).toEqual([
      { typeId: 1, count: 1, mark: 'off' },
      { typeId: 1, count: 1, mark: 'doctrine' },
    ]);
    expect(groups[1]!.lines[0]!.mark).toBe('doctrine');
    expect(groups[2]!.lines[0]!.mark).toBe('off');
    expect(groups[3]!.lines[0]!.mark).toBe('off');
  });
});

describe('fitGroups with a rack lookup', () => {
  it('leaves out a loaded charge sitting in a slot flag, and keeps drones', () => {
    const rackOf = (id: number) => ({ 1: 'high', 2: 'medium', 3: 'low', 4: 'rig' })[id];
    const groups = fitGroups([...ITEMS, item(99, 27, 400)], undefined, rackOf);
    expect(groups[0]!.lines).toEqual([{ typeId: 1, count: 2, mark: null }]);
    expect(groups.at(-1)!.slot).toBe('drone');
  });
});

describe('offDoctrineCount', () => {
  it('counts extra modules and rigs', () => {
    expect(offDoctrineCount(off([1, 3], [4]))).toBe(3);
    expect(offDoctrineCount({ status: 'matched' })).toBe(0);
    expect(offDoctrineCount(undefined)).toBe(0);
  });
});
