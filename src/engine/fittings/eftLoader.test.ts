import { describe, expect, it } from 'vitest';
import { loadEftFitting, eftResultToFitting, type EftTypeLookup } from './eftLoader';
import type { FittingSlotAssignment } from '@/sde/types';

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
      { line: 2, text: 'Some Unknown Module I', reason: 'unknown item' },
    ]);
  });

  it('reports an unresolvable hull and stops, without reading the body', () => {
    const result = load(['[Not A Real Ship]', '125mm Gatling AutoCannon I'].join('\n'));

    expect(result.hullTypeId).toBeNull();
    expect(result.unresolved).toEqual([
      { line: 1, text: 'Not A Real Ship', reason: 'unknown ship' },
    ]);
  });

  it('rejects a slot past the per-category maximum rather than silently dropping it', () => {
    const nineHighSlots = Array.from({ length: 9 }, () => '125mm Gatling AutoCannon I').join('\n');
    const result = load(`[Rifter]\n${nineHighSlots}`);

    expect(result.hullTypeId).toBe(587);
    if (result.hullTypeId === null) return;
    expect(result.modules).toHaveLength(8);
    expect(result.unresolved).toEqual([
      { line: 10, text: '125mm Gatling AutoCannon I', reason: 'too many high slots' },
    ]);
  });

  it('builds a Fitting from a successful result, carrying the given name (not the pasted fit name)', () => {
    const result = load('[Rifter, My Fit]\n1MN Afterburner I');
    if (result.hullTypeId === null) throw new Error('expected a resolved hull');

    const fitting = eftResultToFitting(result, 'Rifter');

    expect(fitting).toEqual({
      name: 'Rifter',
      shipTypeId: 587,
      modules: [{ slot: 'medium', slotIndex: 0, typeId: 439, state: 'active' }],
      drones: [],
      cargo: [],
    });
  });
});
