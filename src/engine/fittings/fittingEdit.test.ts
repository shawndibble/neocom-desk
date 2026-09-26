import { describe, expect, it, vi } from 'vitest';
import {
  addCargo,
  addDrones,
  addDronesWithinBay,
  addModule,
  cargoGroups,
  cargoVolumeUsed,
  copyToAllOfType,
  launchDrones,
  droneBayUsed,
  droneCountMax,
  droneRoom,
  droneGroups,
  droneTotals,
  fillRack,
  firstFreeSlotIndex,
  loadChargeIntoAll,
  loadChargeIntoCompatible,
  moveModule,
  reachableModuleStates,
  newFitting,
  recallDrones,
  removeAllOfType,
  removeModule,
  setCargoQuantity,
  setDroneCountWithinBay,
  setDroneCounts,
  setModuleCharge,
  setModuleState,
  setModulesState,
  swapModuleType,
  unloadCharges,
} from './fittingEdit';
import type { Fitting, FittingModule } from './types';
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

  it('copies an already-loaded charge from a sibling of the same type', () => {
    const next = addModule(base, 'medium', 0, 2889);
    expect(next.modules.find((m) => m.slot === 'medium' && m.slotIndex === 0)).toEqual({
      slot: 'medium',
      slotIndex: 0,
      typeId: 2889,
      state: 'active',
      chargeTypeId: 185,
    });
  });

  it('falls back to the first default-charge candidate when no sibling has one', () => {
    const next = addModule(base, 'medium', 0, 438, () => [77, 88]);
    expect(next.modules.find((m) => m.slot === 'medium' && m.slotIndex === 0)?.chargeTypeId).toBe(
      77
    );
  });

  it('prefers a sibling copy over the default-charge candidates, without asking for them', () => {
    const candidates = vi.fn(() => [999]);
    const next = addModule(base, 'medium', 0, 2889, candidates);
    expect(next.modules.find((m) => m.slot === 'medium' && m.slotIndex === 0)?.chargeTypeId).toBe(
      185
    );
    expect(candidates).not.toHaveBeenCalled();
  });

  it('stays chargeless with no sibling charge and no candidates', () => {
    const next = addModule(base, 'medium', 0, 438);
    expect(
      next.modules.find((m) => m.slot === 'medium' && m.slotIndex === 0)?.chargeTypeId
    ).toBeUndefined();
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

describe('setModulesState / unloadCharges', () => {
  const three: Fitting = {
    ...base,
    modules: [
      { slot: 'high', slotIndex: 0, typeId: 2889, state: 'active', chargeTypeId: 185 },
      { slot: 'high', slotIndex: 1, typeId: 2889, state: 'active', chargeTypeId: 185 },
      { slot: 'high', slotIndex: 2, typeId: 2889, state: 'active', chargeTypeId: 185 },
    ],
  };
  const group = [
    { slot: 'high' as const, slotIndex: 0 },
    { slot: 'high' as const, slotIndex: 1 },
  ];

  it('sets every addressed module’s state in one edit, and leaves the rest', () => {
    const next = setModulesState(three, group, 'offline');
    expect(next.modules.map((m) => m.state)).toEqual(['offline', 'offline', 'active']);
    expect(next.modules[2]).toBe(three.modules[2]);
  });

  it('unloads every addressed module’s charge', () => {
    const fit: Fitting = {
      ...three,
      modules: three.modules.map((m) => ({ ...m, chargeTypeId: 186, chargeQuantity: 10 })),
    };
    const next = unloadCharges(fit, group);
    expect(next.modules.map((m) => m.chargeTypeId)).toEqual([undefined, undefined, 186]);
    expect(next.modules[0]).not.toHaveProperty('chargeQuantity');
  });

  it('gives back to the hold exactly what the app took out for the unloaded modules', () => {
    const fit: Fitting = {
      ...three,
      cargo: [{ typeId: 186, quantity: 5 }],
      modules: three.modules.map((m, i) => ({
        ...m,
        chargeTypeId: 186,
        ...(i < 2 ? { chargeQuantity: 10 } : {}),
      })),
    };
    const next = unloadCharges(fit, [...group, { slot: 'high' as const, slotIndex: 2 }]);
    expect(next.cargo).toEqual([{ typeId: 186, quantity: 25 }]);
  });
});

describe('a charge leaving a module for one that did not come from cargo', () => {
  const held: Fitting = {
    ...base,
    cargo: [],
    modules: [
      {
        slot: 'high',
        slotIndex: 0,
        typeId: 2889,
        state: 'active',
        chargeTypeId: 185,
        chargeQuantity: 7,
      },
    ],
  };

  it('setModuleCharge returns the held quantity to the hold, for a swap and an unload alike', () => {
    expect(setModuleCharge(held, 'high', 0, 186).cargo).toEqual([{ typeId: 185, quantity: 7 }]);
    expect(setModuleCharge(held, 'high', 0, null).cargo).toEqual([{ typeId: 185, quantity: 7 }]);
  });

  it('setModuleCharge to the charge it already holds changes nothing', () => {
    expect(setModuleCharge(held, 'high', 0, 185)).toEqual(held);
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

describe('setCargoQuantity', () => {
  const withCargo: Fitting = {
    ...base,
    cargo: [
      { typeId: 209, quantity: 1500 },
      { typeId: 3001, quantity: 1 },
    ],
  };

  it('sets a cargo type’s quantity in place, whole numbers only', () => {
    const next = setCargoQuantity(withCargo, 209, 250.7);
    expect(next.cargo).toEqual([
      { typeId: 209, quantity: 250 },
      { typeId: 3001, quantity: 1 },
    ]);
    expect(withCargo.cargo[0].quantity).toBe(1500);
  });

  it('removes the type at zero or below', () => {
    expect(setCargoQuantity(withCargo, 209, 0).cargo).toEqual([{ typeId: 3001, quantity: 1 }]);
    expect(setCargoQuantity(withCargo, 3001, -4).cargo).toEqual([{ typeId: 209, quantity: 1500 }]);
  });

  it('folds several stacks of one type into its first', () => {
    const split: Fitting = {
      ...base,
      cargo: [
        { typeId: 209, quantity: 100 },
        { typeId: 3001, quantity: 1 },
        { typeId: 209, quantity: 50 },
      ],
    };
    expect(setCargoQuantity(split, 209, 400).cargo).toEqual([
      { typeId: 209, quantity: 400 },
      { typeId: 3001, quantity: 1 },
    ]);
  });
});

describe('cargoGroups', () => {
  it('lists each cargo type once, first-seen order, with every stack of it added up', () => {
    const split: Fitting = {
      ...base,
      cargo: [
        { typeId: 209, quantity: 100 },
        { typeId: 3001, quantity: 1 },
        { typeId: 209, quantity: 50 },
      ],
    };
    expect(cargoGroups(split)).toEqual([
      { typeId: 209, quantity: 150 },
      { typeId: 3001, quantity: 1 },
    ]);
  });
});

describe('launchDrones', () => {
  const bandwidth: Record<number, number> = { 2185: 10, 2454: 5 };
  const bandwidthOf = (typeId: number) => bandwidth[typeId] ?? 0;
  const carrying = (drones: Fitting['drones']): Fitting => ({ ...base, drones });

  it('launches from the bay in listed order until the bandwidth runs out', () => {
    const fit = carrying([
      { typeId: 2185, quantity: 3, state: 'online' },
      { typeId: 2454, quantity: 5, state: 'online' },
    ]);
    expect(
      droneGroups(launchDrones(fit, { bandwidthTotal: 25, maxActive: 5, bandwidthOf }))
    ).toEqual([
      { typeId: 2185, inSpace: 2, inBay: 1 },
      { typeId: 2454, inSpace: 1, inBay: 4 },
    ]);
  });

  it('stops at the pilot’s max active drones, and launches none without the skill', () => {
    const fit = carrying([{ typeId: 2454, quantity: 8, state: 'online' }]);
    expect(
      droneTotals(launchDrones(fit, { bandwidthTotal: 125, maxActive: 5, bandwidthOf }))
    ).toEqual({
      inSpace: 5,
      inBay: 3,
    });
    expect(launchDrones(fit, { bandwidthTotal: 125, maxActive: 0, bandwidthOf })).toBe(fit);
  });

  it('counts drones already in space against both limits', () => {
    const fit = carrying([
      { typeId: 2185, quantity: 1, state: 'active' },
      { typeId: 2185, quantity: 2, state: 'online' },
    ]);
    expect(
      droneGroups(launchDrones(fit, { bandwidthTotal: 20, maxActive: 5, bandwidthOf }))
    ).toEqual([{ typeId: 2185, inSpace: 2, inBay: 1 }]);
  });

  it('keeps a drone of unknown (infinite) bandwidth in the bay', () => {
    const fit = carrying([{ typeId: 9999, quantity: 3, state: 'online' }]);
    expect(
      launchDrones(fit, {
        bandwidthTotal: 125,
        maxActive: 5,
        bandwidthOf: () => Number.POSITIVE_INFINITY,
      })
    ).toBe(fit);
  });

  it('returns the same Fitting when nothing can launch', () => {
    const fit = carrying([{ typeId: 2185, quantity: 2, state: 'online' }]);
    expect(launchDrones(fit, { bandwidthTotal: 5, maxActive: 5, bandwidthOf })).toBe(fit);
  });
});

describe('reachableModuleStates', () => {
  it('offers every state up to the highest the module can reach', () => {
    expect(reachableModuleStates('overload', 'active')).toEqual([
      'offline',
      'online',
      'active',
      'overload',
    ]);
    expect(reachableModuleStates('online', 'online')).toEqual(['offline', 'online']);
  });

  it('keeps the state it is in, even past what it can reach, so a control can show it', () => {
    expect(reachableModuleStates('online', 'active')).toEqual(['offline', 'online', 'active']);
  });
});

describe('loadChargeIntoCompatible', () => {
  // Two launcher types (a Heavy and a Heavy Assault launcher) that both take
  // the same missile, and a web that takes nothing.
  const launchers: Fitting = {
    ...base,
    modules: [
      { slot: 'high', slotIndex: 0, typeId: 8105, state: 'active' },
      { slot: 'high', slotIndex: 1, typeId: 8105, state: 'active', chargeTypeId: 209 },
      { slot: 'high', slotIndex: 2, typeId: 25715, state: 'active' },
      { slot: 'medium', slotIndex: 0, typeId: 526, state: 'active' },
    ],
    cargo: [{ typeId: 24519, quantity: 1000 }],
  };
  const missileTakers = new Set([8105, 25715]);
  const accepts = (module: FittingModule) => missileTakers.has(module.typeId);
  const perLoad = (module: FittingModule) => (module.typeId === 8105 ? 40 : 30);

  it('loads the charge into every compatible module, whatever its type', () => {
    const result = loadChargeIntoCompatible(launchers, 24519, { accepts });
    expect(result.fitting.modules.map((m) => m.chargeTypeId)).toEqual([
      24519,
      24519,
      24519,
      undefined,
    ]);
    expect(result).toMatchObject({ loaded: 3, wanted: 3, ranOut: false });
    // Not from cargo: the hold is untouched.
    expect(result.fitting.cargo).toEqual(launchers.cargo);
    expect(launchers.modules[0].chargeTypeId).toBeUndefined();
  });

  it('loads only the modules asked for, a weapon group at a time', () => {
    const result = loadChargeIntoCompatible(launchers, 24519, {
      accepts,
      only: [
        { slot: 'high', slotIndex: 0 },
        { slot: 'high', slotIndex: 2 },
      ],
    });
    expect(result.fitting.modules.map((m) => m.chargeTypeId)).toEqual([
      24519,
      209,
      24519,
      undefined,
    ]);
    expect(result).toMatchObject({ loaded: 2, wanted: 2 });
  });

  it('loads only the one module asked for', () => {
    const result = loadChargeIntoCompatible(launchers, 24519, {
      accepts,
      only: { slot: 'high', slotIndex: 2 },
    });
    expect(result.fitting.modules.map((m) => m.chargeTypeId)).toEqual([
      undefined,
      209,
      24519,
      undefined,
    ]);
    expect(result).toMatchObject({ loaded: 1, wanted: 1 });
  });

  it('debits cargo by each module’s load, recording what each took', () => {
    const result = loadChargeIntoCompatible(launchers, 24519, {
      accepts,
      chargesPerLoad: (module, charge) => (charge === 209 ? 50 : perLoad(module)),
      fromCargo: true,
    });
    expect(result.fitting.modules.map((m) => [m.chargeTypeId, m.chargeQuantity])).toEqual([
      [24519, 40],
      [24519, 40],
      [24519, 30],
      [undefined, undefined],
    ]);
    // The 209 the second launcher held never came out of this cargo, so none goes back.
    expect(result.fitting.cargo).toEqual([{ typeId: 24519, quantity: 1000 - 40 - 40 - 30 }]);
  });

  it('returns to the hold exactly what the app took out of it for a module, part-load and all', () => {
    const fit: Fitting = {
      ...launchers,
      modules: [
        { slot: 'high', slotIndex: 0, typeId: 8105, state: 'active' },
        { slot: 'high', slotIndex: 1, typeId: 8105, state: 'active' },
      ],
      cargo: [
        { typeId: 209, quantity: 43 },
        { typeId: 24519, quantity: 100 },
      ],
    };
    const first = loadChargeIntoCompatible(fit, 209, {
      accepts,
      chargesPerLoad: perLoad,
      fromCargo: true,
    });
    // 40 into the first launcher, the last 3 into the second.
    expect(first.fitting.modules.map((m) => m.chargeQuantity)).toEqual([40, 3]);
    const second = loadChargeIntoCompatible(first.fitting, 24519, {
      accepts,
      chargesPerLoad: perLoad,
      fromCargo: true,
    });
    // 40 and 3 go back — the hold's own 43, never two full loads.
    expect(second.fitting.cargo).toEqual([
      { typeId: 24519, quantity: 20 },
      { typeId: 209, quantity: 43 },
    ]);
  });

  it('merges a returned charge into its existing cargo stack', () => {
    const fit: Fitting = {
      ...launchers,
      modules: launchers.modules.map((m) =>
        m.chargeTypeId === 209 ? { ...m, chargeQuantity: 12 } : m
      ),
      cargo: [...launchers.cargo, { typeId: 209, quantity: 5 }],
    };
    const result = loadChargeIntoCompatible(fit, 24519, {
      accepts,
      chargesPerLoad: perLoad,
      fromCargo: true,
    });
    expect(result.fitting.cargo).toContainEqual({ typeId: 209, quantity: 17 });
  });

  it('a load not from cargo records no quantity, dropping one the module had', () => {
    const fit: Fitting = {
      ...launchers,
      modules: launchers.modules.map((m) =>
        m.chargeTypeId === 209 ? { ...m, chargeQuantity: 12 } : m
      ),
    };
    const result = loadChargeIntoCompatible(fit, 24519, { accepts });
    expect(result.fitting.modules.every((m) => m.chargeQuantity === undefined)).toBe(true);
    // What the module held from cargo goes back, whatever replaces it.
    expect(result.fitting.cargo).toEqual([...fit.cargo, { typeId: 209, quantity: 12 }]);
  });

  it('on a shortfall loads what it can, a part-load counting, and says the cargo ran out', () => {
    const fit: Fitting = { ...launchers, cargo: [{ typeId: 24519, quantity: 50 }] };
    const result = loadChargeIntoCompatible(fit, 24519, {
      accepts,
      chargesPerLoad: perLoad,
      fromCargo: true,
    });
    // 40 into the first launcher, the last 10 into the second; none left for the third.
    expect(result.fitting.modules.map((m) => m.chargeTypeId)).toEqual([
      24519,
      24519,
      undefined,
      undefined,
    ]);
    expect(result).toMatchObject({ loaded: 2, wanted: 3, ranOut: true });
    // The 209 the second launcher held wasn't debited from this hold: nothing comes back.
    expect(result.fitting.cargo).toEqual([]);
  });

  it('skips a module already holding the charge, with no debit', () => {
    const fit: Fitting = {
      ...launchers,
      modules: launchers.modules.map((m) =>
        missileTakers.has(m.typeId) ? { ...m, chargeTypeId: 24519 } : m
      ),
    };
    const result = loadChargeIntoCompatible(fit, 24519, {
      accepts,
      chargesPerLoad: perLoad,
      fromCargo: true,
    });
    expect(result.fitting).toBe(fit);
    expect(result).toMatchObject({ loaded: 3, wanted: 3, ranOut: false });
  });

  it('returns the same Fitting when nothing takes the charge, or the cargo holds none', () => {
    expect(loadChargeIntoCompatible(launchers, 24519, { accepts: () => false }).fitting).toBe(
      launchers
    );
    const empty = loadChargeIntoCompatible(launchers, 12345, {
      accepts,
      chargesPerLoad: perLoad,
      fromCargo: true,
    });
    expect(empty.fitting).toBe(launchers);
    expect(empty).toMatchObject({ loaded: 0, wanted: 3, ranOut: true });
  });
});

describe('addCargo / cargoVolumeUsed', () => {
  it('adds to a type’s stack, or appends a new one', () => {
    const fit: Fitting = { ...base, cargo: [{ typeId: 209, quantity: 10 }] };
    expect(addCargo(fit, 209, 5).cargo).toEqual([{ typeId: 209, quantity: 15 }]);
    expect(addCargo(fit, 3001, 2).cargo).toEqual([
      { typeId: 209, quantity: 10 },
      { typeId: 3001, quantity: 2 },
    ]);
    expect(addCargo(fit, 3001, 0)).toBe(fit);
  });

  it('sums m3 over every stack', () => {
    const fit: Fitting = {
      ...base,
      cargo: [
        { typeId: 209, quantity: 100 },
        { typeId: 3001, quantity: 2 },
      ],
    };
    expect(cargoVolumeUsed(fit, (id) => (id === 209 ? 0.01 : 5))).toBeCloseTo(11);
  });
});

describe('module bulk edits', () => {
  const three: Fitting = {
    ...base,
    modules: [
      { slot: 'high', slotIndex: 0, typeId: 2889, state: 'overload', chargeTypeId: 186 },
      { slot: 'high', slotIndex: 1, typeId: 2889, state: 'active', chargeTypeId: 185 },
      { slot: 'high', slotIndex: 2, typeId: 2889, state: 'offline' },
      { slot: 'low', slotIndex: 1, typeId: 2048, state: 'online' },
    ],
  };

  it('copies one module’s state and charge to every module of its type', () => {
    const next = copyToAllOfType(three, 'high', 0);
    expect(next.modules.slice(0, 3).map((m) => [m.state, m.chargeTypeId])).toEqual([
      ['overload', 186],
      ['overload', 186],
      ['overload', 186],
    ]);
    expect(next.modules[3]).toBe(three.modules[3]);
  });

  it('copying an empty module unloads the others too', () => {
    const next = copyToAllOfType(three, 'high', 2);
    expect(next.modules.slice(0, 3).every((m) => m.chargeTypeId === undefined)).toBe(true);
  });

  it('removes every module of a type', () => {
    expect(removeAllOfType(three, 2889).modules).toEqual([three.modules[3]]);
  });

  it('fills a rack’s empty slots with one type', () => {
    const next = fillRack(three, 'high', 5, 2889, () => [185]);
    expect(next.modules.filter((m) => m.slot === 'high').map((m) => m.slotIndex)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    // A fresh one copies a sibling's charge, as addModule does.
    expect(next.modules.find((m) => m.slotIndex === 4)?.chargeTypeId).toBe(186);
    expect(fillRack(three, 'high', 3, 2889)).toBe(three);
  });
});

describe('launching and recalling one drone type', () => {
  const bandwidthOf = (typeId: number) => (typeId === 2185 ? 10 : 5);
  const fit: Fitting = {
    ...base,
    drones: [
      { typeId: 2185, quantity: 2, state: 'online' },
      { typeId: 2454, quantity: 5, state: 'online' },
    ],
  };

  it('launches only the type asked for', () => {
    expect(
      droneGroups(launchDrones(fit, { bandwidthTotal: 50, maxActive: 5, bandwidthOf }, 2454))
    ).toEqual([
      { typeId: 2185, inSpace: 0, inBay: 2 },
      { typeId: 2454, inSpace: 5, inBay: 0 },
    ]);
  });

  it('recalls a type into the bay; the same Fitting when none is out', () => {
    const out = setDroneCounts(fit, 2454, { inSpace: 3, inBay: 2 });
    expect(droneGroups(recallDrones(out, 2454))).toContainEqual({
      typeId: 2454,
      inSpace: 0,
      inBay: 5,
    });
    expect(recallDrones(fit, 2454)).toBe(fit);
  });
});
