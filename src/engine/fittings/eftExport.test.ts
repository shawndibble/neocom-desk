import { describe, expect, it } from 'vitest';
import { fittingToEft } from './eftExport';
import { loadEftFitting, type EftTypeLookup } from './eftLoader';
import type { FittingSlotAssignment } from '@/sde/types';
import type { Fitting } from './types';
import { mutaplasmidLookup } from './mutaplasmids';

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

const NAME_BY_ID: Record<number, string> = {
  587: 'Rifter',
  484: '125mm Gatling AutoCannon I',
  12608: 'Antimatter Charge S',
  439: '1MN Afterburner I',
  2046: 'Damage Control I',
  31105: 'Small Auxiliary Thrusters I',
  2454: 'Hobgoblin I',
  16475: 'Heavy Gremlin Compact Energy Neutralizer',
  47831: 'Gravid Heavy Energy Neutralizer Mutaplasmid',
  47832: 'Heavy Abyssal Energy Neutralizer',
  60461: 'Exigent Light Drone Firepower Mutaplasmid',
  60478: 'Light Mutated Drone',
};

const ID_BY_NAME: Record<string, number> = Object.fromEntries(
  Object.entries(NAME_BY_ID).map(([id, name]) => [name.toLowerCase(), Number(id)])
);

const SLOTS: Record<string, FittingSlotAssignment> = {
  484: 'high',
  439: 'medium',
  2046: 'low',
  31105: 'rig',
  2454: 'drone',
  16475: 'high',
  47832: 'high',
  60478: 'drone',
};

const typeByName: EftTypeLookup = {
  get: (name) => {
    const typeID = ID_BY_NAME[name];
    return typeID === undefined ? undefined : { typeID };
  },
};

function typeName(typeId: number): string {
  return NAME_BY_ID[typeId] ?? `Type ${typeId}`;
}

function fitting(overrides: Partial<Fitting> = {}): Fitting {
  return {
    name: 'Rifter',
    shipTypeId: 587,
    modules: [],
    drones: [],
    cargo: [],
    ...overrides,
  };
}

describe('fittingToEft', () => {
  it('writes a header a parser reads back as the same hull and fit name', () => {
    const text = fittingToEft(fitting({ name: 'My Fit' }), typeName);
    expect(text.split('\n')[0]).toBe('[Rifter, My Fit]');
  });

  it('round-trips modules across every slot category, a loaded charge, a drone stack and cargo', () => {
    const original = fitting({
      modules: [
        { slot: 'high', slotIndex: 0, typeId: 484, state: 'active', chargeTypeId: 12608 },
        { slot: 'medium', slotIndex: 0, typeId: 439, state: 'active' },
        { slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' },
        { slot: 'rig', slotIndex: 0, typeId: 31105, state: 'active' },
      ],
      drones: [{ typeId: 2454, quantity: 3, state: 'online' }],
      cargo: [{ typeId: 12608, quantity: 200 }],
    });

    const text = fittingToEft(original, typeName);
    const result = loadEftFitting(text, typeByName, SLOTS);

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual(original.modules);
    expect(result.drones).toEqual(original.drones);
    expect(result.cargo).toEqual(original.cargo);
    expect(result.unresolved).toEqual([]);
  });

  it('marks an offline module and loads it back offline', () => {
    const original = fitting({
      modules: [{ slot: 'low', slotIndex: 0, typeId: 2046, state: 'offline' }],
    });

    const text = fittingToEft(original, typeName);
    expect(text).toContain('Damage Control I /OFFLINE');
    const result = loadEftFitting(text, typeByName, SLOTS);
    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual([{ slot: 'low', slotIndex: 0, typeId: 2046, state: 'offline' }]);
  });

  it("writes mutated items in Pyfa's layout and loads them back with their rolls", () => {
    const original = fitting({
      modules: [
        {
          slot: 'high',
          slotIndex: 0,
          typeId: 47832,
          state: 'offline',
          mutation: {
            baseTypeId: 16475,
            mutaplasmidTypeId: 47831,
            attributes: { 97: 591.36, 6: 419.25 },
          },
        },
      ],
      drones: [
        {
          typeId: 60478,
          quantity: 1,
          state: 'online',
          mutation: { baseTypeId: 2454, mutaplasmidTypeId: 60461, attributes: { 64: 1.9 } },
        },
      ],
    });

    const text = fittingToEft(original, typeName, { attributeName: mutaplasmids.attributeName });
    expect(text).toBe(
      [
        '[Rifter, Rifter]',
        '',
        'Heavy Gremlin Compact Energy Neutralizer /OFFLINE [1]',
        '',
        'Hobgoblin I x1 [2]',
        '',
        '[1] Heavy Gremlin Compact Energy Neutralizer',
        '  Gravid Heavy Energy Neutralizer Mutaplasmid',
        '  capacitorNeed 419.25, energyNeutralizerAmount 591.36',
        '[2] Hobgoblin I',
        '  Exigent Light Drone Firepower Mutaplasmid',
        '  damageMultiplier 1.9',
      ].join('\n')
    );
    const result = loadEftFitting(text, typeByName, SLOTS, mutaplasmids);
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.modules).toEqual(original.modules);
    expect(result.drones).toEqual(original.drones);
    expect(result.unresolved).toEqual([]);
  });

  it('omits an empty rack entirely rather than writing an empty-slot placeholder', () => {
    const text = fittingToEft(fitting(), typeName);
    expect(text.trim()).toBe('[Rifter, Rifter]');
  });
});
