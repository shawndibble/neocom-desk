import { describe, expect, it } from 'vitest';
import { fittingToDogmaFit } from './fitMapper';
import type { Fitting, PilotProfile } from './types';

const emptyProfile: PilotProfile = {
  skillLevels: new Map(),
  implantTypeIds: [],
  boosterTypeIds: [],
};

function fitting(overrides: Partial<Fitting> = {}): Fitting {
  return {
    name: 'Test Fit',
    shipTypeId: 17843,
    modules: [],
    drones: [],
    cargo: [],
    ...overrides,
  };
}

describe('fittingToDogmaFit', () => {
  it('maps the hull and name straight across', () => {
    const dogmaFit = fittingToDogmaFit(fitting({ name: 'My Vexor Navy Issue' }), emptyProfile);

    expect(dogmaFit.ship).toEqual({ type_id: 17843 });
    expect(dogmaFit.name).toBe('My Vexor Navy Issue');
  });

  it('maps a module to its slot, state and, when loaded, its charge', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({
        modules: [
          { slot: 'high', slotIndex: 0, typeId: 3186, state: 'active', chargeTypeId: 230 },
          { slot: 'low', slotIndex: 1, typeId: 2048, state: 'online' },
        ],
      }),
      emptyProfile
    );

    expect(dogmaFit.items).toContainEqual({
      type_id: 3186,
      slot: { type: 'high', index: 0 },
      state: 'active',
      charge: { type_id: 230 },
    });
    expect(dogmaFit.items).toContainEqual({
      type_id: 2048,
      slot: { type: 'low', index: 1 },
      state: 'online',
    });
  });

  it('maps a drone stack into the drone bay with its quantity', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({ drones: [{ typeId: 2488, quantity: 5, state: 'online' }] }),
      emptyProfile
    );

    expect(dogmaFit.items).toContainEqual({
      type_id: 2488,
      slot: { type: 'drone_bay' },
      quantity: 5,
      state: 'online',
    });
  });

  it('maps cargo into the cargo hold, always offline', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({ cargo: [{ typeId: 230, quantity: 1000 }] }),
      emptyProfile
    );

    expect(dogmaFit.items).toContainEqual({
      type_id: 230,
      slot: { type: 'cargo' },
      quantity: 1000,
      state: 'offline',
    });
  });

  it("maps the pilot's implants into implant slots, numbered from 1", () => {
    const dogmaFit = fittingToDogmaFit(fitting(), {
      skillLevels: new Map(),
      implantTypeIds: [19540, 19553],
      boosterTypeIds: [],
    });

    expect(dogmaFit.items).toContainEqual({
      type_id: 19540,
      slot: { type: 'implant', index: 1 },
      state: 'online',
    });
    expect(dogmaFit.items).toContainEqual({
      type_id: 19553,
      slot: { type: 'implant', index: 2 },
      state: 'online',
    });
  });

  it("maps the pilot's boosters into booster slots, numbered from 1, with side effects off", () => {
    const dogmaFit = fittingToDogmaFit(fitting(), {
      skillLevels: new Map(),
      implantTypeIds: [],
      boosterTypeIds: [30006, 30008],
    });

    expect(dogmaFit.items).toContainEqual({
      type_id: 30006,
      slot: { type: 'booster', index: 1 },
      state: 'online',
      booster_side_effects: [],
    });
    expect(dogmaFit.items).toContainEqual({
      type_id: 30008,
      slot: { type: 'booster', index: 2 },
      state: 'online',
      booster_side_effects: [],
    });
  });

  it("maps the pilot's skill levels into the dogma character", () => {
    const skillLevels = new Map([
      [3300, 5],
      [3301, 3],
    ]);
    const dogmaFit = fittingToDogmaFit(fitting(), {
      skillLevels,
      implantTypeIds: [],
      boosterTypeIds: [],
    });

    expect(dogmaFit.character).toEqual({ skills: skillLevels });
  });
});
