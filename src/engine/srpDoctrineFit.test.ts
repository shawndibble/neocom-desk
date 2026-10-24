import { describe, it, expect } from 'vitest';
import {
  basesOfFromLookup,
  doctrineFitFromEft,
  doctrineFitFromFitting,
} from '@/engine/srpDoctrineFit';
import { mutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import type { Fitting, FittingModule } from '@/engine/fittings/types';

const mod = (slot: FittingModule['slot'], slotIndex: number, typeId: number): FittingModule => ({
  slot,
  slotIndex,
  typeId,
  state: 'active',
});

describe('doctrineFitFromFitting', () => {
  const fitting: Fitting = {
    name: 'Fit A',
    shipTypeId: 1,
    modules: [
      { ...mod('high', 0, 10), chargeTypeId: 30 },
      mod('medium', 0, 12),
      mod('low', 0, 13),
      mod('rig', 0, 21),
      mod('rig', 1, 20),
      mod('subsystem', 0, 50),
      {
        ...mod('high', 1, 40),
        mutation: { baseTypeId: 11, mutaplasmidTypeId: 900, attributes: {} },
      },
    ],
    drones: [{ typeId: 60, quantity: 5, state: 'online' }],
    cargo: [{ typeId: 61, quantity: 10 }],
  };
  it('keeps hull, modules and rigs; drops charges, drones, cargo; mutated stores its base', () => {
    expect(doctrineFitFromFitting(fitting)).toEqual({
      hullTypeId: 1,
      name: 'Fit A',
      modules: [10, 11, 12, 13, 50],
      rigs: [20, 21],
    });
  });
});

describe('doctrineFitFromEft', () => {
  const names: Record<string, number> = {
    rifter: 1,
    'fit b': 0,
    'mod high': 10,
    'mod mid': 12,
    'rig one': 20,
    'some charge': 30,
    'a drone': 60,
  };
  const typeByName = { get: (n: string) => (n in names ? { typeID: names[n] } : undefined) };
  const slots = { 10: 'high', 12: 'medium', 20: 'rig', 60: 'drone' } as const;
  const eft = `[Rifter, Fit B]

Mod Mid

Mod High, Some Charge

Rig One

A Drone x5
`;
  it('parses EFT into a snapshot, ignoring charges and drones', () => {
    const r = doctrineFitFromEft(eft, typeByName, slots);
    expect(r).toMatchObject({
      ok: true,
      fit: { hullTypeId: 1, name: 'Fit B', modules: [10, 12], rigs: [20] },
    });
  });
  it('reports an unknown hull', () => {
    const r = doctrineFitFromEft('[Nothing, X]\n', typeByName, slots);
    expect(r.ok).toBe(false);
  });
});

describe('basesOfFromLookup', () => {
  const lookup = mutaplasmidLookup({
    attributeNames: {},
    mutaplasmids: { 900: { result: 40, bases: [10, 11], attributes: [] } },
    abyssalTypeIds: [40],
  });
  it('maps an abyssal type to its bases, others to undefined', () => {
    const basesOf = basesOfFromLookup(lookup);
    expect(basesOf(40)).toEqual([10, 11]);
    expect(basesOf(10)).toBeUndefined();
  });
});
