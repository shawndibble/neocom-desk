import { describe, expect, it } from 'vitest';
import { arcEndPoint, buildRingSlots, ringSlotPosition } from './ringLayout';
import type { Fitting } from './types';

const fitting: Fitting = {
  name: 'T',
  shipTypeId: 1,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 10, state: 'active' },
    { slot: 'high', slotIndex: 2, typeId: 11, state: 'online' },
    { slot: 'rig', slotIndex: 0, typeId: 12, state: 'online' },
  ],
  drones: [],
  cargo: [],
};

describe('buildRingSlots', () => {
  it('fills the hull layout with empty slots around the fitted ones', () => {
    const slots = buildRingSlots(fitting, { high: 4, medium: 2, low: 0, rig: 3, subsystem: 0 });
    const high = slots.filter((s) => s.rack === 'high');
    expect(high.map((s) => s.module?.typeId)).toEqual([10, undefined, 11, undefined]);
    expect(slots.filter((s) => s.rack === 'medium')).toHaveLength(2);
    expect(slots.filter((s) => s.rack === 'rig').map((s) => s.module?.typeId)).toEqual([
      12,
      undefined,
      undefined,
    ]);
  });

  it('shows only the fitted slots (through the highest index) before the layout is known', () => {
    const slots = buildRingSlots(fitting, null);
    expect(slots.filter((s) => s.rack === 'high')).toHaveLength(3);
    expect(slots.filter((s) => s.rack === 'medium')).toHaveLength(0);
  });

  it('never drops a fitted module the layout says has no slot', () => {
    const slots = buildRingSlots(fitting, { high: 1, medium: 0, low: 0, rig: 0, subsystem: 0 });
    expect(slots.filter((s) => s.rack === 'high')).toHaveLength(3);
  });

  it('renders subsystem slots for a T3 hull', () => {
    const slots = buildRingSlots(fitting, { high: 0, medium: 0, low: 0, rig: 0, subsystem: 5 });
    expect(slots.filter((s) => s.rack === 'subsystem')).toHaveLength(5);
  });
});

describe('ringSlotPosition', () => {
  it('puts high on top, mid right, low bottom, rigs left', () => {
    const high = ringSlotPosition('high', 1, 3);
    const mid = ringSlotPosition('medium', 1, 3);
    const low = ringSlotPosition('low', 1, 3);
    const rig = ringSlotPosition('rig', 1, 3);
    expect(high.y).toBeLessThan(50);
    expect(mid.x).toBeGreaterThan(50);
    expect(low.y).toBeGreaterThan(50);
    expect(rig.x).toBeLessThan(50);
  });

  it('zig-zags crowded racks so neighbours stay apart', () => {
    const a = ringSlotPosition('high', 3, 8);
    const b = ringSlotPosition('high', 4, 8);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(12);
  });
});

describe('arcEndPoint', () => {
  it('starts at the top and ends at the bottom of a half circle', () => {
    expect(arcEndPoint('left', 0, 30)).toEqual({ x: 50, y: 20 });
    const end = arcEndPoint('right', 1, 30);
    expect(end.x).toBeCloseTo(50, 6);
    expect(end.y).toBeCloseTo(80, 6);
  });
});
