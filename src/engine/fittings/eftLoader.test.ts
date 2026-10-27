import { MAX_DRONE_STACKS } from '@/engine/fittings/fittingShare';
import { describe, expect, it } from 'vitest';
import { loadEftFitting, type EftTypeLookup } from './eftLoader';
import type { FittingSlotAssignment } from '@/sde/types';
import { mutaplasmidLookup } from './mutaplasmids';

const TYPES: Record<string, number> = {
  rifter: 587,
  '125mm gatling autocannon i': 484,
  'antimatter charge s': 12608,
  '1mn afterburner i': 439,
  'damage control i': 2046,
  'small auxiliary thrusters i': 31105,
  'hobgoblin i': 2454,
  'warrior ii': 2488,
};

const SLOTS: Record<string, FittingSlotAssignment> = {
  484: 'high',
  439: 'medium',
  2046: 'low',
  31105: 'rig',
  2454: 'drone',
  2488: 'drone',
};

const typeByName: EftTypeLookup = {
  get: (name) => {
    const typeID = TYPES[name];
    return typeID === undefined ? undefined : { typeID };
  },
};

function load(text: string) {
  return loadEftFitting(text, typeByName, SLOTS);
}

describe('loadEftFitting', () => {
  it('loads a hull, a module with a loaded charge, and skips empty-slot markers', () => {
    const result = load(
      [
        '[Rifter, My Fit]',
        '125mm Gatling AutoCannon I, Antimatter Charge S',
        '[Empty High slot]',
        '',
        '1MN Afterburner I',
        '',
        'Damage Control I',
      ].join('\n')
    );

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 484, state: 'active', chargeTypeId: 12608 },
      { slot: 'medium', slotIndex: 0, typeId: 439, state: 'active' },
      { slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('loads a rig', () => {
    const result = load(['[Rifter]', '', '', '', 'Small Auxiliary Thrusters I'].join('\n'));

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual([{ slot: 'rig', slotIndex: 0, typeId: 31105, state: 'active' }]);
  });

  it('loads a drone-bay stack with a count suffix as online, not active', () => {
    const result = load(['[Rifter]', '', '', '', '', '', 'Hobgoblin I x3'].join('\n'));

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.drones).toEqual([{ typeId: 2454, quantity: 3, state: 'online' }]);
  });

  it('sends an item with no known rack to cargo, and a rack item with an explicit count to cargo too', () => {
    const result = load(
      [
        '[Rifter]',
        '',
        '',
        '',
        '',
        '',
        '',
        'Antimatter Charge S x200',
        '125mm Gatling AutoCannon I x1',
      ].join('\n')
    );

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    // Ammo has no rack at all, so it's always cargo. The autocannon does have
    // one (high), but EVE's own export never writes a count on a fitted
    // module line — only cargo-hold contents get one, even a lone spare — so
    // the written "x1" is what says this one is a spare, not fitted.
    expect(result.cargo).toEqual([
      { typeId: 12608, quantity: 200 },
      { typeId: 484, quantity: 1 },
    ]);
    expect(result.modules).toEqual([]);
  });

  it('fits a rack item with no count suffix even when it sits after a blank line', () => {
    const result = load(
      ['[Rifter]', '', '', '', '', '', '', '125mm Gatling AutoCannon I'].join('\n')
    );

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual([{ slot: 'high', slotIndex: 0, typeId: 484, state: 'active' }]);
    expect(result.cargo).toEqual([]);
  });

  it('reports an unknown item by line, and keeps resolving the rest', () => {
    const result = load(['[Rifter]', 'Some Unknown Module I', '', '1MN Afterburner I'].join('\n'));

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual([
      { slot: 'medium', slotIndex: 0, typeId: 439, state: 'active' },
    ]);
    expect(result.unresolved).toEqual([
      { line: 2, text: 'Some Unknown Module I', reason: 'unknown item', kind: 'unknown-item' },
    ]);
  });

  it('reports an unresolvable hull and stops, without reading the body', () => {
    const result = load(['[Not A Real Ship]', '125mm Gatling AutoCannon I'].join('\n'));

    expect(result.hullTypeId).toBeNull();
    expect(result.unresolved).toEqual([
      { line: 1, text: 'Not A Real Ship', reason: 'unknown ship', kind: 'unknown-ship' },
    ]);
  });

  it("passes the parser's own errors on as parse errors, keeping their wording", () => {
    const result = load('125mm Gatling AutoCannon I');

    expect(result.unresolved[0]).toMatchObject({
      line: 1,
      text: '125mm Gatling AutoCannon I',
      kind: 'parse-error',
    });
    expect(result.unresolved[0].reason).toMatch(/^invalid or missing fit header/);
  });

  it('rejects a slot past the per-category maximum rather than silently dropping it', () => {
    const nineHighSlots = Array.from({ length: 9 }, () => '125mm Gatling AutoCannon I').join('\n');
    const result = load(`[Rifter]\n${nineHighSlots}`);

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toHaveLength(8);
    expect(result.unresolved).toEqual([
      {
        line: 10,
        text: '125mm Gatling AutoCannon I',
        reason: 'too many high slots',
        kind: 'too-many-slots',
        rack: 'high',
      },
    ]);
  });
});

describe('loadEftFitting — Pyfa mutated items', () => {
  // Pyfa layout: see the eftFit.ts header.
  const MUTA_TYPES: Record<string, number> = {
    ...TYPES,
    'heavy gremlin compact energy neutralizer': 16475,
    'gravid heavy energy neutralizer mutaplasmid': 47831,
    'heavy abyssal energy neutralizer': 47832,
    'exigent light drone firepower mutaplasmid': 60461,
  };
  const mutaTypeByName: EftTypeLookup = {
    get: (name) => {
      const typeID = MUTA_TYPES[name];
      return typeID === undefined ? undefined : { typeID };
    },
  };
  const mutaSlots: Record<string, FittingSlotAssignment> = {
    ...SLOTS,
    16475: 'high',
    47832: 'high',
    60478: 'drone',
  };
  const lookup = mutaplasmidLookup({
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
  const mutaLoad = (text: string) => loadEftFitting(text, mutaTypeByName, mutaSlots, lookup);

  it('loads a referenced line as the abyssal type, with its base, mutaplasmid and rolls', () => {
    const result = mutaLoad(
      [
        '[Rifter, Neut]',
        'Heavy Gremlin Compact Energy Neutralizer [1]',
        '',
        'Hobgoblin I x2 [2]',
        '',
        '[1] Heavy Gremlin Compact Energy Neutralizer',
        '  Gravid Heavy Energy Neutralizer Mutaplasmid',
        // maxRange isn't rolled by this mutaplasmid here: dropped.
        '  capacitorNeed 419.25, energyNeutralizerAmount 591.36, maxRange 15680',
        '[2] Hobgoblin I',
        '  Exigent Light Drone Firepower Mutaplasmid',
        '  damageMultiplier 1.9',
      ].join('\n')
    );
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.unresolved).toEqual([]);
    expect(result.modules).toEqual([
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
    ]);
    // Each mutated drone is its own item: a stack of two is two drones.
    const drone = {
      typeId: 60478,
      quantity: 1,
      state: 'online',
      mutation: { baseTypeId: 2454, mutaplasmidTypeId: 60461, attributes: { 64: 1.9 } },
    };
    expect(result.drones).toEqual([drone, drone]);
  });

  it('caps a mutated drone line at a drone bay of stacks, however large its count', () => {
    const result = mutaLoad(
      [
        '[Rifter]',
        'Hobgoblin I x999999999 [1]',
        '',
        '[1] Hobgoblin I',
        '  Exigent Light Drone Firepower Mutaplasmid',
      ].join('\n')
    );
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.drones).toHaveLength(MAX_DRONE_STACKS);
  });

  it('keeps base and mutaplasmid when the block has no rolls (rolls unknown)', () => {
    const result = mutaLoad(
      [
        '[Rifter]',
        'Heavy Gremlin Compact Energy Neutralizer [1]',
        '',
        '[1] Heavy Gremlin Compact Energy Neutralizer',
        '  Gravid Heavy Energy Neutralizer Mutaplasmid',
      ].join('\n')
    );
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.modules[0]?.mutation).toEqual({
      baseTypeId: 16475,
      mutaplasmidTypeId: 47831,
      attributes: {},
    });
  });

  it('loads the plain base module, with a warning, when the mutaplasmid is unknown', () => {
    const result = mutaLoad(
      [
        '[Rifter]',
        'Heavy Gremlin Compact Energy Neutralizer [1]',
        '',
        '[1] Heavy Gremlin Compact Energy Neutralizer',
        '  Wobbly Neutralizer Mutaplasmid',
      ].join('\n')
    );
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 16475, state: 'active' },
    ]);
    expect(result.unresolved).toEqual([
      {
        line: 5,
        text: 'Wobbly Neutralizer Mutaplasmid',
        reason: 'unknown mutaplasmid',
        kind: 'unknown-mutation',
      },
    ]);
  });

  it('loads the plain base module when the reference has no block, as Pyfa does', () => {
    const result = mutaLoad('[Rifter]\nHeavy Gremlin Compact Energy Neutralizer [3]\n');
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 16475, state: 'active' },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('loads a bare abyssal line as its type, with no mutation (base unknown)', () => {
    const result = mutaLoad('[Rifter]\nHeavy Abyssal Energy Neutralizer\n');
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 47832, state: 'active' },
    ]);
    expect(lookup.isAbyssalType(result.modules[0]!.typeId)).toBe(true);
  });

  it('without the mutaplasmid data, loads the base module plain', () => {
    const result = loadEftFitting(
      '[Rifter]\nHeavy Gremlin Compact Energy Neutralizer [1]\n\n[1] Heavy Gremlin Compact Energy Neutralizer\n  Gravid Heavy Energy Neutralizer Mutaplasmid\n',
      mutaTypeByName,
      mutaSlots
    );
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 16475, state: 'active' },
    ]);
  });
});
