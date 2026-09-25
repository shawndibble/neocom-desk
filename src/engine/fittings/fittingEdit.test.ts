import { describe, expect, it } from 'vitest';
import {
  addDrones,
  addModule,
  droneGroups,
  firstFreeSlotIndex,
  removeModule,
  setDroneCounts,
  setModuleCharge,
  setModuleState,
  swapModuleType,
} from './fittingEdit';
import type { Fitting } from './types';

const base: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 2889, state: 'active', chargeTypeId: 185 },
    { slot: 'low', slotIndex: 1, typeId: 2048, state: 'online' },
  ],
  drones: [{ typeId: 2454, quantity: 2, state: 'active' }],
  cargo: [],
};

describe('addModule', () => {
  it('fills an empty slot and keeps modules in rack then slot order', () => {
    const next = addModule(base, 'medium', 0, 438);
    expect(next.modules.map((m) => `${m.slot}${m.slotIndex}`)).toEqual([
      'high0',
      'medium0',
      'low1',
    ]);
    expect(next.modules[1]).toEqual({ slot: 'medium', slotIndex: 0, typeId: 438, state: 'active' });
  });

  it('replaces whatever occupied that slot, dropping its charge', () => {
    const next = addModule(base, 'high', 0, 3001);
    expect(next.modules.filter((m) => m.slot === 'high')).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 3001, state: 'active' },
    ]);
  });

  it('does not mutate its input', () => {
    addModule(base, 'medium', 0, 438);
    expect(base.modules).toHaveLength(2);
  });
});

describe('removeModule', () => {
  it('empties the slot and leaves the rest', () => {
    const next = removeModule(base, 'high', 0);
    expect(next.modules).toEqual([base.modules[1]]);
  });

  it('is a no-op for an already-empty slot', () => {
    expect(removeModule(base, 'rig', 0).modules).toEqual(base.modules);
  });
});

describe('setModuleState / setModuleCharge', () => {
  it('changes only the addressed module state', () => {
    const next = setModuleState(base, 'low', 1, 'offline');
    expect(next.modules[1].state).toBe('offline');
    expect(next.modules[0]).toBe(base.modules[0]);
  });

  it('loads, swaps and unloads a charge', () => {
    expect(setModuleCharge(base, 'high', 0, 186).modules[0].chargeTypeId).toBe(186);
    const unloaded = setModuleCharge(base, 'high', 0, null).modules[0];
    expect(unloaded).toEqual({ slot: 'high', slotIndex: 0, typeId: 2889, state: 'active' });
    expect('chargeTypeId' in unloaded).toBe(false);
  });
});

describe('swapModuleType', () => {
  it('changes only the addressed module type, keeping its state and charge', () => {
    const next = swapModuleType(base, 'high', 0, 3001);
    expect(next.modules[0]).toEqual({
      slot: 'high',
      slotIndex: 0,
      typeId: 3001,
      state: 'active',
      chargeTypeId: 185,
    });
    expect(next.modules[1]).toBe(base.modules[1]);
  });

  it('is a no-op for an empty slot', () => {
    expect(swapModuleType(base, 'medium', 0, 438).modules).toEqual(base.modules);
  });

  it('does not mutate its input', () => {
    swapModuleType(base, 'high', 0, 3001);
    expect(base.modules[0].typeId).toBe(2889);
  });
});

describe('firstFreeSlotIndex', () => {
  it('returns the lowest index not taken within the rack size', () => {
    expect(firstFreeSlotIndex(base, 'low', 3)).toBe(0);
    expect(firstFreeSlotIndex(addModule(base, 'low', 0, 1), 'low', 3)).toBe(2);
  });

  it('returns null when the rack is full or has no slots', () => {
    expect(firstFreeSlotIndex(base, 'high', 1)).toBeNull();
    expect(firstFreeSlotIndex(base, 'rig', 0)).toBeNull();
  });
});

describe('drones', () => {
  const mixed: Fitting = {
    ...base,
    drones: [
      { typeId: 2454, quantity: 2, state: 'active' },
      { typeId: 2486, quantity: 3, state: 'online' },
      { typeId: 2454, quantity: 1, state: 'online' },
    ],
  };

  it('groups stacks by type in first-seen order, as in space vs in bay', () => {
    expect(droneGroups(mixed)).toEqual([
      { typeId: 2454, inSpace: 2, inBay: 1 },
      { typeId: 2486, inSpace: 0, inBay: 3 },
    ]);
  });

  it('rewrites one type as an active stack and a bay stack in its original position', () => {
    const next = setDroneCounts(mixed, 2454, { inSpace: 1, inBay: 2 });
    expect(next.drones).toEqual([
      { typeId: 2454, quantity: 1, state: 'active' },
      { typeId: 2454, quantity: 2, state: 'online' },
      { typeId: 2486, quantity: 3, state: 'online' },
    ]);
  });

  it('drops empty stacks, and the whole type at zero', () => {
    expect(setDroneCounts(mixed, 2486, { inSpace: 3, inBay: 0 }).drones).toContainEqual({
      typeId: 2486,
      quantity: 3,
      state: 'active',
    });
    expect(setDroneCounts(mixed, 2454, { inSpace: 0, inBay: 0 }).drones).toEqual([
      { typeId: 2486, quantity: 3, state: 'online' },
    ]);
  });

  it('clamps negative and fractional counts to whole non-negative numbers', () => {
    expect(setDroneCounts(base, 2454, { inSpace: -2, inBay: 1.7 }).drones).toEqual([
      { typeId: 2454, quantity: 1, state: 'online' },
    ]);
  });

  it('adds new drones to the bay, merging into a type already carried', () => {
    expect(addDrones(base, 2486, 5).drones).toEqual([
      { typeId: 2454, quantity: 2, state: 'active' },
      { typeId: 2486, quantity: 5, state: 'online' },
    ]);
    expect(droneGroups(addDrones(base, 2454, 1))).toEqual([{ typeId: 2454, inSpace: 2, inBay: 1 }]);
  });
});
