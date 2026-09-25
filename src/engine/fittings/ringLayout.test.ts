import { describe, expect, it } from 'vitest';
import {
  RING_POSITIONS,
  RING_SLOT_RADIUS,
  RING_TILE,
  buildRingSlots,
  gaugeTicks,
  ringGhostIndices,
  ringPoint,
  ringSlotAngle,
} from './ringLayout';
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

describe('ringSlotAngle', () => {
  const angles = (rack: 'high' | 'medium' | 'low' | 'rig') =>
    Array.from({ length: RING_POSITIONS[rack] }, (_, index) => ringSlotAngle(rack, index));

  it('fills each rack clockwise from its first position', () => {
    for (const rack of ['high', 'medium', 'low', 'rig'] as const) {
      const list = angles(rack);
      for (let i = 1; i < list.length; i++) expect(list[i]).toBeGreaterThan(list[i - 1]);
    }
  });

  it('puts highs across the top, mids down the right, lows along the bottom, rigs upper-left', () => {
    for (const a of angles('high')) expect(Math.abs(a)).toBeLessThan(50);
    for (const a of angles('medium')) {
      expect(a).toBeGreaterThan(45);
      expect(a).toBeLessThan(135);
    }
    for (const a of angles('low')) {
      expect(a).toBeGreaterThan(135);
      expect(a).toBeLessThan(225);
    }
    for (const a of angles('rig')) {
      expect(a).toBeGreaterThan(-100);
      expect(a).toBeLessThan(-55);
    }
  });

  it('never lets two racks overlap', () => {
    const order = [angles('rig'), angles('high'), angles('medium'), angles('low')];
    for (let i = 1; i < order.length; i++) {
      expect(Math.min(...order[i])).toBeGreaterThan(Math.max(...order[i - 1]));
    }
    // Lows wrap round to the rigs through the bottom-left.
    expect(Math.min(...angles('rig')) + 360).toBeGreaterThan(Math.max(...angles('low')));
  });

  it('keeps neighbouring tiles apart on the ring', () => {
    const a = ringPoint(ringSlotAngle('high', 3), RING_SLOT_RADIUS);
    const b = ringPoint(ringSlotAngle('high', 4), RING_SLOT_RADIUS);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(RING_TILE);
  });
});

describe('ringGhostIndices', () => {
  it('lists the positions a rack has beyond the hull’s own slots', () => {
    expect(ringGhostIndices('high', 5)).toEqual([5, 6, 7]);
    expect(ringGhostIndices('rig', 3)).toEqual([]);
    expect(ringGhostIndices('medium', 0)).toHaveLength(8);
  });

  it('has none past a rack a hull overfills', () => {
    expect(ringGhostIndices('rig', 4)).toEqual([]);
  });
});

describe('ringPoint', () => {
  it('measures clockwise from 12 o’clock around the centre', () => {
    const top = ringPoint(0, 10);
    expect(top.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(-10, 6);
    const right = ringPoint(90, 10);
    expect(right.x).toBeCloseTo(10, 6);
    expect(right.y).toBeCloseTo(0, 6);
  });
});

describe('gaugeTicks', () => {
  it('spreads the ticks from the first angle to the last', () => {
    const { filled, empty } = gaugeTicks(100, 140, 5, 0);
    expect(filled).toEqual([]);
    expect(empty).toEqual([100, 110, 120, 130, 140]);
  });

  it('fills the share used, from the first tick', () => {
    const { filled, empty } = gaugeTicks(0, 40, 5, 0.6);
    expect(filled).toEqual([0, 10, 20]);
    expect(empty).toEqual([30, 40]);
  });

  it('fills every tick when over budget, and none for an unknown share', () => {
    expect(gaugeTicks(0, 40, 5, 1.4).empty).toEqual([]);
    expect(gaugeTicks(0, 40, 5, Number.NaN).filled).toEqual([]);
  });
});
