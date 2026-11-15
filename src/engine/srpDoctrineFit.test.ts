import { describe, it, expect } from 'vitest';
import {
  basesOfFromLookup,
  doctrineFitFromEft,
  doctrineFitFromFitting,
  fittingFromDoctrineSnapshot,
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
  it('also keeps the whole fit, charges and drones included, for its share code', () => {
    const r = doctrineFitFromEft(eft, typeByName, slots);
    if (!r.ok) throw new Error('expected a fit');
    expect(r.fitting).toMatchObject({ name: 'Fit B', shipTypeId: 1 });
    expect(r.fitting.modules.find((m) => m.typeId === 10)?.chargeTypeId).toBe(30);
    expect(r.fitting.drones).toEqual([{ typeId: 60, quantity: 5, state: expect.any(String) }]);
  });
  it('reports an unknown hull', () => {
    const r = doctrineFitFromEft('[Nothing, X]\n', typeByName, slots);
    expect(r.ok).toBe(false);
  });
});

describe('fittingFromDoctrineSnapshot', () => {
  const slots = { 10: 'high', 12: 'medium', 20: 'rig', 50: 'subsystem' } as const;
  it('rebuilds hull, modules, rigs and subsystems in their racks, nothing else', () => {
    const fitting = fittingFromDoctrineSnapshot(
      { hullTypeId: 1, name: 'Old', modules: [10, 10, 12, 50], rigs: [20] },
      'Old Fleet Fit',
      slots
    );
    expect(fitting).toEqual({
      name: 'Old Fleet Fit',
      shipTypeId: 1,
      modules: [
        { slot: 'high', slotIndex: 0, typeId: 10, state: 'active' },
        { slot: 'high', slotIndex: 1, typeId: 10, state: 'active' },
        { slot: 'medium', slotIndex: 0, typeId: 12, state: 'active' },
        { slot: 'rig', slotIndex: 0, typeId: 20, state: 'active' },
        { slot: 'subsystem', slotIndex: 0, typeId: 50, state: 'active' },
      ],
      drones: [],
      cargo: [],
    });
  });
  it('round-trips through doctrineFitFromFitting to the same snapshot SRP matches', () => {
    const snapshot = { hullTypeId: 1, name: 'X', modules: [10, 12, 50], rigs: [20] };
    expect(doctrineFitFromFitting(fittingFromDoctrineSnapshot(snapshot, 'X', slots))).toEqual(
      snapshot
    );
  });
  it('drops a type the slot map no longer knows rather than carrying it as cargo', () => {
    const fitting = fittingFromDoctrineSnapshot(
      { hullTypeId: 1, name: 'X', modules: [10, 999], rigs: [] },
      'X',
      slots
    );
    expect(fitting.modules.map((m) => m.typeId)).toEqual([10]);
    expect(fitting.cargo).toEqual([]);
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
