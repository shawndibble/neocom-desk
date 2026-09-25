import { describe, expect, it } from 'vitest';
import {
  addDrones,
  addDronesWithinBay,
  addModule,
  droneBayUsed,
  droneCountMax,
  droneRoom,
  droneGroups,
  droneTotals,
  firstFreeSlotIndex,
  loadChargeIntoAll,
  moveModule,
  newFitting,
  removeModule,
  setDroneCountWithinBay,
  setDroneCounts,
  setModuleCharge,
  setModuleState,
  swapModuleType,
} from './fittingEdit';
import type { Fitting } from './types';
import type { DroneBay } from './fittingEdit';

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

describe('newFitting', () => {
  it('is the bare hull, named after it', () => {
    expect(newFitting(17843, 'Vexor Navy Issue')).toEqual({
      name: 'Vexor Navy Issue',
      shipTypeId: 17843,
      modules: [],
      drones: [],
      cargo: [],
    });
  });
});

describe('loadChargeIntoAll', () => {
  it('loads the charge into every fitted module of that type, and leaves the rest', () => {
    const two = addModule(base, 'high', 1, 2889);
    const next = loadChargeIntoAll(two, 2889, 186);
    expect(next.modules.filter((m) => m.typeId === 2889).map((m) => m.chargeTypeId)).toEqual([
      186, 186,
    ]);
    expect(next.modules.find((m) => m.slot === 'low')!.chargeTypeId).toBeUndefined();
  });

  it('keeps each module’s state', () => {
    const next = loadChargeIntoAll(base, 2889, 186);
    expect(next.modules[0].state).toBe('active');
  });
});

describe('moveModule', () => {
  it('moves a module to a free slot of its rack, keeping state and charge', () => {
    const next = moveModule(base, 'high', 0, 3);
    expect(next.modules.filter((m) => m.slot === 'high')).toEqual([
      { slot: 'high', slotIndex: 3, typeId: 2889, state: 'active', chargeTypeId: 185 },
    ]);
  });

  it('swaps with whatever occupies the target slot', () => {
    const two = addModule(base, 'high', 2, 3001);
    const next = moveModule(two, 'high', 0, 2);
    expect(next.modules.filter((m) => m.slot === 'high')).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 3001, state: 'active' },
      { slot: 'high', slotIndex: 2, typeId: 2889, state: 'active', chargeTypeId: 185 },
    ]);
  });

  it('leaves the Fitting as it was for an empty source or the same slot', () => {
    expect(moveModule(base, 'high', 5, 1)).toBe(base);
    expect(moveModule(base, 'high', 0, 0)).toBe(base);
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

describe('drone bay volume', () => {
  // Hobgoblin 5 m3, Hammerhead 10 m3; a 50 m3 bay.
  const VOLUME: Record<number, number> = { 2454: 5, 2185: 10 };
  const volumeOf = (typeId: number) => VOLUME[typeId] ?? 0;
  const bay = (capacity: number): DroneBay => ({ capacity, volumeOf });
  const fit: Fitting = {
    name: 'Drones',
    shipTypeId: 1,
    modules: [],
    drones: [
      { typeId: 2454, quantity: 2, state: 'active' },
      { typeId: 2454, quantity: 1, state: 'online' },
      { typeId: 2185, quantity: 2, state: 'online' },
    ],
    cargo: [],
  };

  it('counts drones in space and in the bay alike — both come out of the bay', () => {
    expect(droneBayUsed(fit, volumeOf)).toBe(35);
  });

  it('says how many more of a type fit beside everything else', () => {
    // 35 of 50 m3 used: three more Hobgoblins, one more Hammerhead.
    expect(droneRoom(fit, 2454, bay(50))).toBe(3);
    expect(droneRoom(fit, 2185, bay(50))).toBe(1);
  });

  it('is zero, never negative, when nothing more fits — even over the cap already', () => {
    expect(droneRoom(fit, 2185, bay(40))).toBe(0);
    expect(droneRoom(fit, 2454, bay(10))).toBe(0);
  });

  it('does not cap a type whose volume is unknown, or a bay not known yet', () => {
    expect(droneRoom(fit, 999, bay(50))).toBe(Infinity);
    expect(droneRoom(fit, 2454, null)).toBe(Infinity);
  });
});

describe('addDronesWithinBay', () => {
  const volumeOf = (typeId: number) => ({ 2454: 5, 2185: 10 })[typeId] ?? 0;
  const empty: Fitting = { name: 'D', shipTypeId: 1, modules: [], drones: [], cargo: [] };

  it('adds as many as asked while they fit', () => {
    expect(droneGroups(addDronesWithinBay(empty, 2454, 3, { capacity: 50, volumeOf }))).toEqual([
      { typeId: 2454, inSpace: 0, inBay: 3 },
    ]);
  });

  it('stops at what the bay holds', () => {
    const full = addDronesWithinBay(empty, 2185, 9, { capacity: 20, volumeOf });
    expect(droneGroups(full)).toEqual([{ typeId: 2185, inSpace: 0, inBay: 2 }]);
    // Nothing more fits: the same Fitting back, so no empty edit is recorded.
    expect(addDronesWithinBay(full, 2454, 1, { capacity: 20, volumeOf })).toBe(full);
  });
});

describe('setDroneCountWithinBay', () => {
  const volumeOf = (typeId: number) => ({ 2454: 5, 2185: 10 })[typeId] ?? 0;
  const fit: Fitting = {
    name: 'D',
    shipTypeId: 1,
    modules: [],
    drones: [
      { typeId: 2454, quantity: 2, state: 'active' },
      { typeId: 2454, quantity: 1, state: 'online' },
    ],
    cargo: [],
  };

  it('sets one count, keeping the other', () => {
    expect(
      droneGroups(setDroneCountWithinBay(fit, 2454, { inBay: 3 }, { capacity: 50, volumeOf }))
    ).toEqual([{ typeId: 2454, inSpace: 2, inBay: 3 }]);
  });

  it('raises a count no further than the bay holds', () => {
    // 25 m3: five Hobgoblins, two of them in space — three in the bay at most.
    expect(
      droneGroups(setDroneCountWithinBay(fit, 2454, { inBay: 50 }, { capacity: 25, volumeOf }))
    ).toEqual([{ typeId: 2454, inSpace: 2, inBay: 3 }]);
  });

  it('always lets a count come down, even on a fit already over the cap', () => {
    // 15 m3 of Hobgoblins in a 10 m3 bay: lowering still works, raising doesn't.
    const small = { capacity: 10, volumeOf };
    expect(droneGroups(setDroneCountWithinBay(fit, 2454, { inSpace: 1 }, small))).toEqual([
      { typeId: 2454, inSpace: 1, inBay: 1 },
    ]);
    expect(droneGroups(setDroneCountWithinBay(fit, 2454, { inBay: 4 }, small))).toEqual([
      { typeId: 2454, inSpace: 2, inBay: 1 },
    ]);
  });

  it('does not cap before the bay is known', () => {
    expect(droneGroups(setDroneCountWithinBay(fit, 2454, { inBay: 40 }, null))).toEqual([
      { typeId: 2454, inSpace: 2, inBay: 40 },
    ]);
  });

  it('gives the highest each count box may go', () => {
    expect(droneCountMax(fit, 2454, 'inBay', { capacity: 25, volumeOf })).toBe(3);
    expect(droneCountMax(fit, 2454, 'inSpace', { capacity: 25, volumeOf })).toBe(4);
    // Over the cap already: the box may stay where it is, not climb.
    expect(droneCountMax(fit, 2454, 'inBay', { capacity: 10, volumeOf })).toBe(1);
  });
});

describe('droneTotals', () => {
  it('adds up launched and bay drones across every type', () => {
    const fit: Fitting = {
      name: 'D',
      shipTypeId: 1,
      modules: [],
      drones: [
        { typeId: 2454, quantity: 2, state: 'active' },
        { typeId: 2454, quantity: 1, state: 'online' },
        { typeId: 2185, quantity: 3, state: 'online' },
      ],
      cargo: [],
    };
    expect(droneTotals(fit)).toEqual({ inSpace: 2, inBay: 4 });
  });
});
