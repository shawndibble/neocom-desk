import { describe, expect, it } from 'vitest';
import {
  RING_GAUGES,
  RING_GAUGE_RADIUS,
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  RING_POSITIONS,
  RING_SLOT_RADIUS,
  RING_TILE,
  RING_VIEW,
  arcPath,
  buildRingSlots,
  gaugeArc,
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

  it('puts highs across the top, mids down the right, lows along the bottom, rigs on the left', () => {
    for (const a of angles('high')) {
      expect(a).toBeGreaterThan(-60);
      expect(a).toBeLessThan(35);
    }
    for (const a of angles('medium')) {
      expect(a).toBeGreaterThan(45);
      expect(a).toBeLessThan(135);
    }
    for (const a of angles('low')) {
      expect(a).toBeGreaterThan(150);
      expect(a).toBeLessThan(240);
    }
    for (const a of angles('rig')) {
      expect(a).toBeGreaterThan(-105);
      expect(a).toBeLessThan(-75);
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

  it('keeps neighbouring tiles apart even at their inner corners, where the ring is tightest', () => {
    const inner = RING_SLOT_RADIUS - RING_TILE / 2;
    const a = ringPoint(ringSlotAngle('high', 3), inner);
    const b = ringPoint(ringSlotAngle('high', 4), inner);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(RING_TILE + 2);
  });

  it('seats every tile inside the band', () => {
    expect(RING_SLOT_RADIUS - RING_TILE / 2).toBeGreaterThanOrEqual(RING_INNER_RADIUS);
    expect(RING_SLOT_RADIUS + RING_TILE / 2).toBeLessThanOrEqual(RING_OUTER_RADIUS);
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

describe('RING_GAUGES', () => {
  const span = (gauge: { from: number; to: number }) =>
    [Math.min(gauge.from, gauge.to), Math.max(gauge.from, gauge.to)] as const;

  it('keeps CPU and powergrid well apart, either side of the bottom', () => {
    const [, cpuEnd] = span(RING_GAUGES.cpu);
    const [pgStart] = span(RING_GAUGES.powergrid);
    expect(pgStart - cpuEnd).toBeGreaterThanOrEqual(12);
    // CPU on the right half of the ring, powergrid on the left.
    for (const angle of span(RING_GAUGES.cpu)) expect(angle).toBeLessThan(180);
    for (const angle of span(RING_GAUGES.powergrid)) expect(angle).toBeGreaterThan(180);
  });

  it('fills CPU and powergrid upward from the bottom', () => {
    expect(RING_GAUGES.cpu.from).toBeGreaterThan(RING_GAUGES.cpu.to);
    expect(RING_GAUGES.powergrid.from).toBeLessThan(RING_GAUGES.powergrid.to);
  });

  it('never lets two gauges overlap', () => {
    const spans = Object.values(RING_GAUGES)
      .map((gauge) => span(gauge).map((a) => (a + 360) % 360))
      .map(([a, b]) => (a <= b ? [a, b] : [a, b + 360]))
      .sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
  });

  it('draws the rim inside the view box', () => {
    expect(RING_GAUGE_RADIUS).toBeGreaterThan(RING_OUTER_RADIUS);
    expect(RING_GAUGE_RADIUS + 8).toBeLessThanOrEqual(RING_VIEW / 2);
  });
});

describe('gaugeArc', () => {
  it('splits the arc at the share used, from its first end', () => {
    expect(gaugeArc(100, 140, 0.25)).toEqual({ filled: [100, 110], empty: [110, 140] });
    expect(gaugeArc(172, 100, 0.5)).toEqual({ filled: [172, 136], empty: [136, 100] });
  });

  it('fills it all when over budget, and none for an unknown or zero share', () => {
    expect(gaugeArc(0, 40, 1.4)).toEqual({ filled: [0, 40], empty: null });
    expect(gaugeArc(0, 40, Number.NaN)).toEqual({ filled: null, empty: [0, 40] });
    expect(gaugeArc(0, 40, 0)).toEqual({ filled: null, empty: [0, 40] });
  });
});

describe('arcPath', () => {
  it('draws clockwise when the angle grows, counter-clockwise when it shrinks', () => {
    expect(arcPath(0, 90, 10, 0, 0)).toBe('M0.0 -10.0A10 10 0 0 1 10.0 0.0');
    expect(arcPath(90, 0, 10, 0, 0)).toBe('M10.0 0.0A10 10 0 0 0 0.0 -10.0');
  });

  it('takes the long way round past half a turn, offset to the centre given', () => {
    expect(arcPath(0, 270, 10, 5, 5)).toBe('M5.0 -5.0A10 10 0 1 1 -5.0 5.0');
  });
});
