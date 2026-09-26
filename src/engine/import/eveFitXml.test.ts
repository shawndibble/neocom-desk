import { describe, expect, it } from 'vitest';
import { loadEveFitXmlEntry, type FittingXmlEntry } from './eveFitXml';
import type { EftTypeLookup } from '@/engine/fittings/eftLoader';

const TYPES: Record<string, number> = {
  rifter: 587,
  '125mm gatling autocannon ii': 2881,
  'antimatter charge s': 12608,
  'damage control i': 2046,
  'hobgoblin i': 2454,
  'nanite repair paste': 28668,
  'templar i': 23055,
};

const typeByName: EftTypeLookup = {
  get: (name) => {
    const typeID = TYPES[name];
    return typeID === undefined ? undefined : { typeID };
  },
};

function entry(overrides: Partial<FittingXmlEntry>): FittingXmlEntry {
  return {
    name: '[Rifter, My Fit]',
    shipTypeName: 'Rifter',
    hardware: [],
    ...overrides,
  };
}

describe('loadEveFitXmlEntry', () => {
  it('loads a hull, a module with its loaded charge, a drone-bay stack and cargo', () => {
    const result = loadEveFitXmlEntry(
      entry({
        hardware: [
          { slot: 'high slot 0', type: '125mm Gatling AutoCannon II' },
          { slot: 'high slot 0', type: 'Antimatter Charge S' },
          { slot: 'low slot 0', type: 'Damage Control I' },
          { slot: 'drone bay', type: 'Hobgoblin I', qty: 3 },
          { slot: 'cargo hold', type: 'Nanite Repair Paste', qty: 50 },
        ],
      }),
      typeByName
    );

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 2881, state: 'active', chargeTypeId: 12608 },
      { slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' },
    ]);
    expect(result.drones).toEqual([{ typeId: 2454, quantity: 3, state: 'online' }]);
    expect(result.cargo).toEqual([{ typeId: 28668, quantity: 50 }]);
    expect(result.unresolved).toEqual([]);
  });

  it("reads the game's own slot names — 'hi slot N', 'med slot N' and 'cargo' — as pyfa writes them too", () => {
    const result = loadEveFitXmlEntry(
      entry({
        hardware: [
          { slot: 'hi slot 0', type: '125mm Gatling AutoCannon II' },
          { slot: 'med slot 1', type: 'Damage Control I' },
          { slot: 'cargo', type: 'Nanite Repair Paste', qty: 50 },
        ],
      }),
      typeByName
    );

    expect(result.unresolved).toEqual([]);
    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 2881, state: 'active' },
      { slot: 'medium', slotIndex: 1, typeId: 2046, state: 'active' },
    ]);
    expect(result.cargo).toEqual([{ typeId: 28668, quantity: 50 }]);
  });

  it('defaults a missing qty to 1 for drones and cargo', () => {
    const result = loadEveFitXmlEntry(
      entry({ hardware: [{ slot: 'drone bay', type: 'Hobgoblin I' }] }),
      typeByName
    );
    if (result.hullTypeId === null) throw new Error('expected a hull');
    expect(result.drones).toEqual([{ typeId: 2454, quantity: 1, state: 'online' }]);
  });

  it('reports an unknown ship and resolves nothing else', () => {
    const result = loadEveFitXmlEntry(entry({ shipTypeName: 'Not A Ship' }), typeByName);
    expect(result.hullTypeId).toBeNull();
    expect(result.unresolved).toEqual([{ text: 'Not A Ship', reason: 'unknown ship' }]);
  });

  it('reports an unknown item without failing the rest of the fitting', () => {
    const result = loadEveFitXmlEntry(
      entry({
        hardware: [
          { slot: 'high slot 0', type: 'Not A Real Module' },
          { slot: 'low slot 0', type: 'Damage Control I' },
        ],
      }),
      typeByName
    );
    if (result.hullTypeId === null) throw new Error('expected a hull');
    expect(result.modules).toEqual([{ slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' }]);
    expect(result.unresolved).toEqual([{ text: 'Not A Real Module', reason: 'unknown item' }]);
  });

  it('reports a slot index past the rack size without failing the rest of the fitting', () => {
    const result = loadEveFitXmlEntry(
      entry({
        hardware: [
          { slot: 'high slot 100', type: '125mm Gatling AutoCannon II' },
          { slot: 'low slot 0', type: 'Damage Control I' },
        ],
      }),
      typeByName
    );
    if (result.hullTypeId === null) throw new Error('expected a hull');
    expect(result.modules).toEqual([{ slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' }]);
    expect(result.unresolved).toEqual([
      { text: '125mm Gatling AutoCannon II', reason: 'too many high slots' },
    ]);
  });

  it('reports an unrecognized slot string without failing the rest of the fitting', () => {
    const result = loadEveFitXmlEntry(
      entry({
        hardware: [
          { slot: 'implant', type: 'Damage Control I' },
          { slot: 'low slot 0', type: 'Damage Control I' },
        ],
      }),
      typeByName
    );
    if (result.hullTypeId === null) throw new Error('expected a hull');
    expect(result.modules).toEqual([{ slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' }]);
    expect(result.unresolved).toEqual([
      { text: 'Damage Control I', reason: 'unknown slot: implant' },
    ]);
  });
});

describe('loadEveFitXmlEntry — fighters', () => {
  it('loads the fighter bay as squadrons, in the bay', () => {
    const result = loadEveFitXmlEntry(
      entry({ hardware: [{ slot: 'fighter bay', type: 'Templar I', qty: 12 }] }),
      typeByName
    );
    if (result.hullTypeId === null) throw new Error('no hull');
    expect(result.fighters).toEqual([
      { typeId: 23055, quantity: 6, state: 'online' },
      { typeId: 23055, quantity: 6, state: 'online' },
    ]);
    expect(result.unresolved).toEqual([]);
  });
});
