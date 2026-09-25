import { describe, expect, it } from 'vitest';
import {
  esiFittingToFitting,
  fittingToEsiFitting,
  type EsiCharacterFitting,
} from './esiFittingMapper';
import type { Fitting } from './types';

function esiFitting(overrides: Partial<EsiCharacterFitting> = {}): EsiCharacterFitting {
  return {
    fitting_id: 1,
    name: 'My Fit',
    description: '',
    ship_type_id: 587,
    items: [],
    ...overrides,
  };
}

describe('esiFittingToFitting', () => {
  it('maps hi/med/lo/rig/subsystem slot flags to their racks, in canonical order', () => {
    const { fitting, unresolved } = esiFittingToFitting(
      esiFitting({
        items: [
          { flag: 'MedSlot0', quantity: 1, type_id: 439 },
          { flag: 'HiSlot0', quantity: 1, type_id: 484 },
          { flag: 'LoSlot0', quantity: 1, type_id: 2046 },
          { flag: 'RigSlot0', quantity: 1, type_id: 31105 },
          { flag: 'SubSystemSlot2', quantity: 1, type_id: 99999 },
        ],
      })
    );
    expect(fitting.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 484, state: 'active' },
      { slot: 'medium', slotIndex: 0, typeId: 439, state: 'active' },
      { slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' },
      { slot: 'rig', slotIndex: 0, typeId: 31105, state: 'active' },
      { slot: 'subsystem', slotIndex: 2, typeId: 99999, state: 'active' },
    ]);
    expect(unresolved).toEqual([]);
  });

  it('maps DroneBay to a carried (online, not active) drone stack and Cargo to cargo', () => {
    const { fitting } = esiFittingToFitting(
      esiFitting({
        items: [
          { flag: 'DroneBay', quantity: 5, type_id: 2454 },
          { flag: 'Cargo', quantity: 100, type_id: 12608 },
        ],
      })
    );
    expect(fitting.drones).toEqual([{ typeId: 2454, quantity: 5, state: 'online' }]);
    expect(fitting.cargo).toEqual([{ typeId: 12608, quantity: 100 }]);
  });

  it('carries the fitting name and hull straight through', () => {
    const { fitting } = esiFittingToFitting(esiFitting({ name: 'PvP Rifter', ship_type_id: 587 }));
    expect(fitting.name).toBe('PvP Rifter');
    expect(fitting.shipTypeId).toBe(587);
  });

  it('flags an unsupported flag (FighterBay, ServiceSlot, Invalid) as unresolved rather than dropping it silently', () => {
    const { fitting, unresolved } = esiFittingToFitting(
      esiFitting({
        items: [
          { flag: 'FighterBay', quantity: 1, type_id: 1 },
          { flag: 'ServiceSlot0', quantity: 1, type_id: 2 },
          { flag: 'Invalid', quantity: 1, type_id: 3 },
        ],
      })
    );
    expect(fitting.modules).toEqual([]);
    expect(unresolved).toEqual([
      { flag: 'FighterBay', typeId: 1 },
      { flag: 'ServiceSlot0', typeId: 2 },
      { flag: 'Invalid', typeId: 3 },
    ]);
  });
});

function fitting(overrides: Partial<Fitting> = {}): Fitting {
  return {
    name: 'PvP Rifter',
    shipTypeId: 587,
    modules: [],
    drones: [],
    cargo: [],
    ...overrides,
  };
}

describe('fittingToEsiFitting', () => {
  it('maps modules to their slot flags, dropping state and charge — ESI accepts neither', () => {
    const esi = fittingToEsiFitting(
      fitting({
        modules: [
          { slot: 'high', slotIndex: 0, typeId: 484, state: 'overload', chargeTypeId: 12608 },
          { slot: 'medium', slotIndex: 1, typeId: 439, state: 'offline' },
          { slot: 'low', slotIndex: 0, typeId: 2046, state: 'active' },
          { slot: 'rig', slotIndex: 0, typeId: 31105, state: 'active' },
          { slot: 'subsystem', slotIndex: 2, typeId: 99999, state: 'active' },
        ],
      }),
      'PvP Rifter',
      ''
    );
    expect(esi.items).toEqual([
      { flag: 'HiSlot0', quantity: 1, type_id: 484 },
      { flag: 'MedSlot1', quantity: 1, type_id: 439 },
      { flag: 'LoSlot0', quantity: 1, type_id: 2046 },
      { flag: 'RigSlot0', quantity: 1, type_id: 31105 },
      { flag: 'SubSystemSlot2', quantity: 1, type_id: 99999 },
    ]);
  });

  it('maps drones to DroneBay and cargo to Cargo, carrying quantity through', () => {
    const esi = fittingToEsiFitting(
      fitting({
        drones: [{ typeId: 2454, quantity: 5, state: 'online' }],
        cargo: [{ typeId: 12608, quantity: 100 }],
      }),
      'PvP Rifter',
      ''
    );
    expect(esi.items).toEqual([
      { flag: 'DroneBay', quantity: 5, type_id: 2454 },
      { flag: 'Cargo', quantity: 100, type_id: 12608 },
    ]);
  });

  it("carries the given name, description and hull through, not the Fitting object's own name", () => {
    const esi = fittingToEsiFitting(
      fitting({ name: 'Original', shipTypeId: 587 }),
      'Renamed',
      'a note'
    );
    expect(esi.name).toBe('Renamed');
    expect(esi.description).toBe('a note');
    expect(esi.ship_type_id).toBe(587);
  });
});
