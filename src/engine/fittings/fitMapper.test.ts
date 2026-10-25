import { describe, expect, it } from 'vitest';
import { fittingToDogmaFit } from './fitMapper';
import { mutaplasmidLookup } from './mutaplasmids';
import type { Fitting, FittingModule, PilotProfile } from './types';

// Real ids from public/data/mutaplasmids.json: Gravid Heavy Energy Neutralizer
// Mutaplasmid (47831) makes the Heavy Abyssal Energy Neutralizer (47832) from a
// Heavy Gremlin Compact (16475); Exigent Light Drone Firepower (60461) makes a
// Light Mutated Drone (60478) from a Hobgoblin I (2454).
const mutaplasmids = mutaplasmidLookup({
  attributeNames: { 6: 'capacitorNeed', 97: 'energyNeutralizerAmount', 64: 'damageMultiplier' },
  mutaplasmids: {
    47831: {
      result: 47832,
      bases: [16475],
      attributes: [
        { id: 6, min: 0.8, max: 1.3, highIsGood: false },
        { id: 97, min: 0.9, max: 1.2, highIsGood: true },
      ],
    },
    60461: {
      result: 60478,
      bases: [2454],
      attributes: [{ id: 64, min: 1, max: 1.2, highIsGood: true }],
    },
  },
  abyssalTypeIds: [47832, 60478],
});

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
  it('hands a mutated module and drone their base and rolls (engine Mutation)', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({
        modules: [
          {
            slot: 'high',
            slotIndex: 0,
            typeId: 47832,
            state: 'active',
            mutation: {
              baseTypeId: 16475,
              mutaplasmidTypeId: 47831,
              attributes: { 6: 419.25, 97: 591.36 },
            },
          },
        ],
        drones: [
          {
            typeId: 60478,
            quantity: 1,
            state: 'active',
            mutation: { baseTypeId: 2454, mutaplasmidTypeId: 60461, attributes: { 64: 1.9 } },
          },
        ],
      }),
      emptyProfile,
      undefined,
      mutaplasmids
    );

    expect(dogmaFit.items[0]).toEqual({
      type_id: 47832,
      slot: { type: 'high', index: 0 },
      state: 'active',
      mutation: { base: 16475, attributes: { 6: 419.25, 97: 591.36 } },
    });
    expect(dogmaFit.items[1]).toMatchObject({
      type_id: 60478,
      mutation: { base: 2454, attributes: { 64: 1.9 } },
    });
  });

  it('hands base-only when the rolls are unknown, so the engine states the base module', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({
        modules: [
          {
            slot: 'high',
            slotIndex: 0,
            typeId: 47832,
            state: 'active',
            mutation: { baseTypeId: 16475, mutaplasmidTypeId: 47831, attributes: {} },
          },
        ],
      }),
      emptyProfile,
      undefined,
      mutaplasmids
    );
    expect(dogmaFit.items[0]?.mutation).toEqual({ base: 16475 });
  });

  const neut = (mutation: FittingModule['mutation'], typeId = 47832): Fitting =>
    fitting({ modules: [{ slot: 'high', slotIndex: 0, typeId, state: 'active', mutation }] });

  it('hands the engine only the attributes the mutaplasmid rolls (a forged CPU of 0 dropped)', () => {
    const dogmaFit = fittingToDogmaFit(
      neut({ baseTypeId: 16475, mutaplasmidTypeId: 47831, attributes: { 6: 419.25, 50: 0 } }),
      emptyProfile,
      undefined,
      mutaplasmids
    );
    expect(dogmaFit.items[0]?.mutation).toEqual({ base: 16475, attributes: { 6: 419.25 } });
  });

  it('hands a mutation that does not make its item in bare (plain module, wrong base)', () => {
    const forged = { baseTypeId: 16475, mutaplasmidTypeId: 47831, attributes: { 6: 1 } };
    const onPlain = fittingToDogmaFit(neut(forged, 2048), emptyProfile, undefined, mutaplasmids);
    expect(onPlain.items[0]).not.toHaveProperty('mutation');
    const wrongBase = fittingToDogmaFit(
      neut({ ...forged, baseTypeId: 2454 }),
      emptyProfile,
      undefined,
      mutaplasmids
    );
    expect(wrongBase.items[0]).not.toHaveProperty('mutation');
  });

  it('hands every mutated item in base-only when the mutaplasmid data is not loaded', () => {
    const dogmaFit = fittingToDogmaFit(
      neut({ baseTypeId: 16475, mutaplasmidTypeId: 47831, attributes: { 6: 419.25 } }),
      emptyProfile
    );
    expect(dogmaFit.items[0]?.mutation).toEqual({ base: 16475 });
  });

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

  it('maps a launched drone stack into the drone bay with its quantity', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({ drones: [{ typeId: 2488, quantity: 5, state: 'active' }] }),
      emptyProfile
    );

    expect(dogmaFit.items).toContainEqual({
      type_id: 2488,
      slot: { type: 'drone_bay' },
      quantity: 5,
      state: 'active',
    });
  });

  it('maps a drone stack sitting in the bay to offline, which the engine leaves unlaunched', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({ drones: [{ typeId: 2488, quantity: 5, state: 'online' }] }),
      emptyProfile
    );

    expect(dogmaFit.items).toContainEqual({
      type_id: 2488,
      slot: { type: 'drone_bay' },
      quantity: 5,
      state: 'offline',
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

  it('puts each implant and booster in its own EVE slot, not its place in the list', () => {
    // A clone with only a slot-10 implant: list position would call it slot 1, and the
    // engine reports "in a slot it can't use".
    const slotOf = (typeId: number) =>
      typeId === 22535
        ? { kind: 'implant' as const, slot: 10 }
        : typeId === 30006
          ? { kind: 'booster' as const, slot: 3 }
          : undefined;
    const dogmaFit = fittingToDogmaFit(
      fitting(),
      { skillLevels: new Map(), implantTypeIds: [22535, 19540], boosterTypeIds: [30006] },
      undefined,
      null,
      slotOf
    );

    expect(dogmaFit.items).toContainEqual({
      type_id: 22535,
      slot: { type: 'implant', index: 10 },
      state: 'online',
    });
    // One the lookup does not know keeps its place in the list.
    expect(dogmaFit.items).toContainEqual({
      type_id: 19540,
      slot: { type: 'implant', index: 2 },
      state: 'online',
    });
    expect(dogmaFit.items).toContainEqual({
      type_id: 30006,
      slot: { type: 'booster', index: 3 },
      state: 'online',
      booster_side_effects: [],
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

  it('leaves the environment off entirely with no damage profile', () => {
    expect(fittingToDogmaFit(fitting(), emptyProfile)).not.toHaveProperty('environment');
  });

  it('measures EHP against a damage profile and adapts the RAH to it', () => {
    const dogmaFit = fittingToDogmaFit(fitting(), emptyProfile, {
      em: 0,
      thermal: 1828,
      kinetic: 7413,
      explosive: 0,
    });

    expect(dogmaFit.environment).toEqual({
      damage_profile: { em: 0, thermal: 1828, kinetic: 7413, explosive: 0 },
      reactive_armor: 'damage_profile',
    });
  });
});

describe('fittingToDogmaFit — Tactical Destroyer modes and booster side effects', () => {
  const SVIPUL = 34562;

  it('puts the chosen mode on the ship', () => {
    const dogmaFit = fittingToDogmaFit(fitting({ shipTypeId: SVIPUL, mode: 34570 }), emptyProfile);
    expect(dogmaFit.ship).toEqual({ type_id: SVIPUL, mode: 34570 });
  });

  it('flies a Tactical Destroyer with no mode chosen in its Defense Mode, as the game does', () => {
    expect(fittingToDogmaFit(fitting({ shipTypeId: SVIPUL }), emptyProfile).ship).toEqual({
      type_id: SVIPUL,
      mode: 34564,
    });
  });

  it('never gives a mode to a hull that has none', () => {
    expect(fittingToDogmaFit(fitting({ mode: 34570 }), emptyProfile).ship).toEqual({
      type_id: 17843,
    });
  });

  it("switches on each booster's own side effects the pilot chose, and no other booster's", () => {
    const dogmaFit = fittingToDogmaFit(fitting(), {
      skillLevels: new Map(),
      implantTypeIds: [],
      // Standard Blue Pill, Standard Drop.
      boosterTypeIds: [9950, 15466],
      boosterSideEffects: [2737, 2749, 2741],
    });
    const booster = (typeId: number) => dogmaFit.items.find((item) => item.type_id === typeId);
    // Shield capacity is a side effect of both; explosion velocity only the Blue Pill's.
    expect(booster(9950)?.booster_side_effects).toEqual([2737, 2749]);
    expect(booster(15466)?.booster_side_effects).toEqual([2737, 2741]);
  });
});

describe('fittingToDogmaFit — fighters', () => {
  it('launches each squadron into the next tube, keeps the rest in the bay, after the drones and before cargo', () => {
    const dogmaFit = fittingToDogmaFit(
      fitting({
        shipTypeId: 23911,
        drones: [{ typeId: 2488, quantity: 5, state: 'online' }],
        fighters: [
          { typeId: 23055, quantity: 6, state: 'active' },
          { typeId: 23055, quantity: 6, state: 'online' },
          { typeId: 37599, quantity: 3, state: 'active' },
        ],
        cargo: [{ typeId: 34, quantity: 1 }],
      }),
      emptyProfile
    );
    expect(dogmaFit.items.map((item) => item.slot)).toEqual([
      { type: 'drone_bay' },
      { type: 'fighter_tube', index: 0 },
      { type: 'fighter_bay' },
      { type: 'fighter_tube', index: 1 },
      { type: 'cargo' },
    ]);
    expect(dogmaFit.items[1]).toEqual({
      type_id: 23055,
      slot: { type: 'fighter_tube', index: 0 },
      quantity: 6,
      state: 'active',
    });
    expect(dogmaFit.items[2].state).toBe('offline');
  });
});
