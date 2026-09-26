import { describe, expect, it } from 'vitest';
import { acceptsDrop, chargeDragLights, type FittingDragPayload } from './fittingDrag';

const all = { addType: true, moveModule: true, loadCharge: true, launchDrone: true };
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
