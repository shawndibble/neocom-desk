import { describe, expect, it } from 'vitest';
import { fittingToEft } from './eftExport';
import { loadEftFitting, type EftTypeLookup } from './eftLoader';
import type { FittingSlotAssignment } from '@/sde/types';
import type { Fitting } from './types';

const NAME_BY_ID: Record<number, string> = {
  587: 'Rifter',
  484: '125mm Gatling AutoCannon I',
  12608: 'Antimatter Charge S',
  439: '1MN Afterburner I',
  2046: 'Damage Control I',
  31105: 'Small Auxiliary Thrusters I',
  2454: 'Hobgoblin I',
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

  it('marks an offline module so the parser strips the same suffix it strips on load', () => {
    const original = fitting({
      modules: [{ slot: 'low', slotIndex: 0, typeId: 2046, state: 'offline' }],
    });

    const text = fittingToEft(original, typeName);
    expect(text).toContain('Damage Control I /OFFLINE');
    const result = loadEftFitting(text, typeByName, SLOTS);
    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    // The loader never tracks offline state back (matches in-game import) —
    // this only proves the suffix doesn't break the module from parsing.
    expect(result.modules).toEqual([{ slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' }]);
  });

  it('omits an empty rack entirely rather than writing an empty-slot placeholder', () => {
    const text = fittingToEft(fitting(), typeName);
    expect(text.trim()).toBe('[Rifter, Rifter]');
  });
});
