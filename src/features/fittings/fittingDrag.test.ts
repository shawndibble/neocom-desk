import { describe, expect, it } from 'vitest';
import type { FittingModule } from '@/engine/fittings/types';
import {
  acceptsDrop,
  chargeDragLights,
  chargeSlotDropOnly,
  ringDropFor,
  type FittingDragPayload,
} from './fittingDrag';

const all = {
  addType: true,
  moveModule: true,
  loadCharge: true,
  launchDrone: true,
  addCargo: true,
};
const slot = (rack: 'high' | 'medium', index: number, filled = true) =>
  ({ kind: 'slot', rack, index, filled }) as const;

describe('acceptsDrop', () => {
  it('takes nothing without a drag', () => {
    expect(acceptsDrop(null, slot('high', 0), all)).toBe(false);
  });

  it('takes an Add panel module on its own rack only, slot or heading', () => {
    const payload: FittingDragPayload = { kind: 'type', typeId: 1, rack: 'high' };
    expect(acceptsDrop(payload, slot('high', 2, false), all)).toBe(true);
    expect(acceptsDrop(payload, { kind: 'rack', rack: 'high' }, all)).toBe(true);
    expect(acceptsDrop(payload, slot('medium', 0), all)).toBe(false);
    expect(acceptsDrop(payload, slot('high', 2), { ...all, addType: false })).toBe(false);
  });

  it('moves a fitted module along its rack, never onto itself', () => {
    const payload: FittingDragPayload = { kind: 'slot', rack: 'high', index: 1 };
    expect(acceptsDrop(payload, slot('high', 3), all)).toBe(true);
    expect(acceptsDrop(payload, slot('high', 1), all)).toBe(false);
    expect(acceptsDrop(payload, { kind: 'rack', rack: 'high' }, all)).toBe(false);
  });

  it('lands a charge only on a module that takes it, whatever the module type', () => {
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 209,
      fromCargo: true,
      targets: ['high-0', 'high-2'],
    };
    expect(acceptsDrop(payload, slot('high', 0), all)).toBe(true);
    expect(acceptsDrop(payload, slot('high', 2), all)).toBe(true);
    expect(acceptsDrop(payload, slot('high', 1), all)).toBe(false);
    expect(acceptsDrop(payload, { kind: 'rack', rack: 'high' }, all)).toBe(true);
    expect(acceptsDrop(payload, { kind: 'rack', rack: 'medium' }, all)).toBe(false);
    expect(acceptsDrop(payload, { kind: 'drones' }, all)).toBe(false);
    expect(acceptsDrop(payload, slot('high', 0), { ...all, loadCharge: false })).toBe(false);
  });

  it('launches a drone, from the bay or the Add panel, only on the Drones rack', () => {
    const fromBay: FittingDragPayload = { kind: 'drone', typeId: 2488 };
    const fromPanel: FittingDragPayload = { kind: 'type', typeId: 2488, rack: 'drone' };
    for (const payload of [fromBay, fromPanel]) {
      expect(acceptsDrop(payload, { kind: 'drones' }, all)).toBe(true);
      expect(acceptsDrop(payload, slot('high', 0), all)).toBe(false);
      expect(acceptsDrop(payload, { kind: 'drones' }, { ...all, launchDrone: false })).toBe(false);
    }
  });

  it('puts an Add panel item of any kind, or an Add panel charge, in the cargo', () => {
    const cargo = { kind: 'cargo' } as const;
    expect(acceptsDrop({ kind: 'type', typeId: 1, rack: 'high' }, cargo, all)).toBe(true);
    expect(acceptsDrop({ kind: 'type', typeId: 2488, rack: 'drone' }, cargo, all)).toBe(true);
    const charge = { kind: 'charge', typeId: 209, targets: [] } as const;
    expect(acceptsDrop({ ...charge, fromCargo: false }, cargo, all)).toBe(true);
    // Already in the hold: dropping it back would only inflate the stack.
    expect(acceptsDrop({ ...charge, fromCargo: true }, cargo, all)).toBe(false);
    expect(
      acceptsDrop({ kind: 'type', typeId: 1, rack: 'high', fromCargo: true }, cargo, all)
    ).toBe(false);
    expect(acceptsDrop({ kind: 'slot', rack: 'high', index: 0 }, cargo, all)).toBe(false);
    expect(acceptsDrop({ kind: 'drone', typeId: 2488 }, cargo, all)).toBe(false);
    expect(
      acceptsDrop({ kind: 'type', typeId: 1, rack: 'high' }, cargo, { ...all, addCargo: false })
    ).toBe(false);
  });
});

const fitted = (
  slot: FittingModule['slot'],
  slotIndex: number,
  chargeTypeId?: number
): FittingModule => ({ slot, slotIndex, typeId: 100, state: 'active', chargeTypeId });
const layout = { high: 3, medium: 3, low: 2, rig: 3, subsystem: 0 };

describe('ringDropFor', () => {
  it('fits a module in the first free slot of its rack, wherever it was dropped', () => {
    const modules = [fitted('medium', 0), fitted('medium', 2)];
    expect(ringDropFor({ kind: 'type', typeId: 7, rack: 'medium' }, modules, layout)).toEqual({
      kind: 'fit',
      rack: 'medium',
      index: 1,
      typeId: 7,
    });
  });

  it('places nothing when the rack is full or the layout is not known yet', () => {
    const modules = [fitted('low', 0), fitted('low', 1)];
    const payload: FittingDragPayload = { kind: 'type', typeId: 7, rack: 'low' };
    expect(ringDropFor(payload, modules, layout)).toBeNull();
    expect(ringDropFor({ ...payload, rack: 'high' }, [], null)).toBeNull();
  });

  it('leaves moves and drones to their own targets', () => {
    expect(ringDropFor({ kind: 'slot', rack: 'high', index: 0 }, [], layout)).toBeNull();
    expect(ringDropFor({ kind: 'drone', typeId: 2488 }, [], layout)).toBeNull();
    expect(ringDropFor({ kind: 'type', typeId: 2488, rack: 'drone' }, [], layout)).toBeNull();
  });

  it('loads a high-slot charge into every high module that takes it, loaded or not', () => {
    const modules = [fitted('high', 0, 5), fitted('high', 1), fitted('high', 2)];
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 209,
      fromCargo: true,
      targets: ['high-2', 'high-0'],
    };
    expect(ringDropFor(payload, modules, layout)).toEqual({
      kind: 'load',
      typeId: 209,
      fromCargo: true,
      only: [
        { slot: 'high', slotIndex: 0 },
        { slot: 'high', slotIndex: 2 },
      ],
    });
  });

  it('loads a mid or low charge with only one taker into it, even over a loaded charge', () => {
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 30,
      fromCargo: false,
      targets: ['medium-1'],
    };
    expect(ringDropFor(payload, [fitted('medium', 1, 31)], layout)).toEqual({
      kind: 'load',
      typeId: 30,
      fromCargo: false,
      only: [{ slot: 'medium', slotIndex: 1 }],
    });
  });

  it('loads a mid or low charge with several takers into the first one still empty', () => {
    const modules = [fitted('medium', 0, 31), fitted('medium', 1), fitted('medium', 2)];
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 30,
      fromCargo: false,
      targets: ['medium-2', 'medium-1', 'medium-0'],
    };
    expect(ringDropFor(payload, modules, layout)).toMatchObject({
      only: [{ slot: 'medium', slotIndex: 1 }],
    });
  });

  it('loads nothing when every one of several takers is already loaded — that is a slot drop', () => {
    const modules = [fitted('medium', 0, 31), fitted('medium', 1, 31)];
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 30,
      fromCargo: false,
      targets: ['medium-0', 'medium-1'],
    };
    expect(ringDropFor(payload, modules, layout)).toBeNull();
    expect(ringDropFor({ ...payload, targets: [] }, modules, layout)).toBeNull();
  });
});

describe('chargeSlotDropOnly', () => {
  it('loads a high charge dropped on one module into all of them, Alt for just that one', () => {
    expect(chargeSlotDropOnly('high', 2, false)).toBeUndefined();
    expect(chargeSlotDropOnly('high', 2, true)).toEqual({ slot: 'high', slotIndex: 2 });
  });

  it('loads a mid or low charge dropped on one module into that one only', () => {
    expect(chargeSlotDropOnly('medium', 1, false)).toEqual({ slot: 'medium', slotIndex: 1 });
    expect(chargeSlotDropOnly('low', 0, false)).toEqual({ slot: 'low', slotIndex: 0 });
  });
});

describe('chargeDragLights', () => {
  it('lights the modules a charge drag would load, dims the rest, and says nothing otherwise', () => {
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 209,
      fromCargo: false,
      targets: ['medium-1'],
    };
    expect(chargeDragLights(payload, 'medium', 1)).toBe('lit');
    expect(chargeDragLights(payload, 'high', 0)).toBe('dim');
    expect(chargeDragLights({ kind: 'slot', rack: 'high', index: 0 }, 'high', 0)).toBeNull();
    expect(chargeDragLights(null, 'high', 0)).toBeNull();
  });
});
