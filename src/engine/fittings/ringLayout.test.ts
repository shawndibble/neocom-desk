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
  hardpointGlyphAngle,
  hardpointPipAngles,
  ringGhostIndices,
  ringPoint,
  ringSlotAngle,
  ringSlotAngles,
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

describe('ringSlotAngles', () => {
  const tactical = { high: 7, medium: 5, low: 4, rig: 3, subsystem: 0 };
  // A T3 cruiser's slots once its four subsystems are fitted.
  const t3 = { high: 6, medium: 5, low: 6, rig: 3, subsystem: 4 };
  const RING_ORDER = ['rig', 'subsystem', 'high', 'medium', 'low'] as const;
  /** Every tile's angle in clockwise order from the rigs, unwrapped so they only rise. */
  const clockwise = (angles: Record<string, number[]>) => {
    const list = RING_ORDER.flatMap((rack) => angles[rack]);
    return list.map((a, i) => (i > 0 && a < list[0] ? a + 360 : a));
  };
  const steps = (list: number[]) => list.slice(1).map((a, i) => a - list[i]);
  const innerChord = (degrees: number) =>
    2 * (RING_SLOT_RADIUS - RING_TILE / 2) * Math.sin((degrees * Math.PI) / 360);

  it('leaves a hull without subsystems exactly where the racks always sat', () => {
    const angles = ringSlotAngles(tactical);
    for (const rack of ['high', 'medium', 'low', 'rig'] as const) {
      expect(angles[rack]).toEqual(
        Array.from({ length: tactical[rack] }, (_, index) => ringSlotAngle(rack, index))
      );
    }
    expect(angles.subsystem).toEqual([]);
  });

  it('puts a T3’s subsystems on the band between the rigs and the highs', () => {
    const list = clockwise(ringSlotAngles(t3));
    for (let i = 1; i < list.length; i++) expect(list[i]).toBeGreaterThan(list[i - 1]);
    // And the lows still come round to the rigs.
    expect(list[0] + 360).toBeGreaterThan(list[list.length - 1]);
  });

  it('keeps a T3’s highs centred over the top, as every hull’s are', () => {
    const highs = ringSlotAngles(t3).high;
    expect((highs[0] + highs[highs.length - 1]) / 2).toBeCloseTo(-15, 6);
  });

  it('closes a T3’s racks to one empty position apart, the spare room left between the lows and rigs', () => {
    // A Tengu fit: fewer slots than the band has room for.
    const angles = ringSlotAngles({ high: 5, medium: 5, low: 3, rig: 3, subsystem: 4 });
    for (const rack of RING_ORDER) {
      for (const step of steps(angles[rack])) expect(step).toBeCloseTo(12, 6);
    }
    const list = clockwise(angles);
    const gaps = steps(list).filter((s) => s > 12.5);
    expect(gaps).toHaveLength(4);
    for (const gap of gaps) expect(gap).toBeCloseTo(24, 6);
    // The lows-to-rigs gap, across the bottom, takes the rest.
    expect(list[0] + 360 - list[list.length - 1]).toBeGreaterThan(24);
  });

  it('puts a bare T3 hull’s subsystems on the left, before any subsystem gives it highs', () => {
    const subsystems = ringSlotAngles({
      high: 0,
      medium: 0,
      low: 0,
      rig: 3,
      subsystem: 4,
    }).subsystem;
    expect((subsystems[0] + subsystems[subsystems.length - 1]) / 2).toBeCloseTo(-90, 6);
  });

  it('gives a rack with no slots no gap', () => {
    const angles = ringSlotAngles({ ...t3, rig: 0 });
    expect(angles.rig).toEqual([]);
    const list = clockwise(angles);
    expect(
      [...steps(list), list[0] + 360 - list[list.length - 1]].filter((s) => s > 12.5)
    ).toHaveLength(4);
  });

  it('squeezes the gaps, then the pitch, before letting any T3 tiles overlap', () => {
    const crowded = { high: 7, medium: 6, low: 7, rig: 3, subsystem: 4 };
    const list = clockwise(ringSlotAngles(crowded));
    const all = [...steps(list), list[0] + 360 - list[list.length - 1]];
    expect(all.reduce((sum, s) => sum + s, 0)).toBeCloseTo(360, 6);
    for (const step of all) expect(innerChord(step)).toBeGreaterThanOrEqual(RING_TILE);
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

describe('hardpointPipAngles', () => {
  it('runs turrets out left from 12 o’clock and launchers out right', () => {
    const turrets = hardpointPipAngles('turret', 3);
    const launchers = hardpointPipAngles('launcher', 2);
    expect(turrets).toHaveLength(3);
    expect(launchers).toHaveLength(2);
    for (const angle of turrets) expect(angle).toBeLessThan(0);
    for (const angle of launchers) expect(angle).toBeGreaterThan(0);
    expect(turrets[0]).toBeGreaterThan(turrets[1]);
    expect(launchers[0]).toBeLessThan(launchers[1]);
  });

  it('fits eight of each in the top gap, clear of the calibration and bandwidth bands', () => {
    const all = [...hardpointPipAngles('turret', 8), ...hardpointPipAngles('launcher', 8)];
    for (const angle of all) {
      expect(angle).toBeGreaterThan(RING_GAUGES.calibration.to);
      expect(angle).toBeLessThan(RING_GAUGES.droneBandwidth.from);
    }
  });
});

describe('hardpointGlyphAngle', () => {
  it('puts each kind’s glyph on its own side, between 12 o’clock and its first pip', () => {
    const turret = hardpointGlyphAngle('turret');
    const launcher = hardpointGlyphAngle('launcher');
    expect(turret).toBeLessThan(0);
    expect(launcher).toBeGreaterThan(0);
    expect(turret).toBeGreaterThan(hardpointPipAngles('turret', 1)[0]);
    expect(launcher).toBeLessThan(hardpointPipAngles('launcher', 1)[0]);
  });

  it('leaves a glyph’s width clear on both sides: of the other glyph and of the first pip', () => {
    // A glyph is about 3.3° wide at the gauge radius, a pip about 1.8°.
    const launcher = hardpointGlyphAngle('launcher');
    expect(launcher * 2).toBeGreaterThanOrEqual(3.3 + 2);
    expect(hardpointPipAngles('launcher', 1)[0] - launcher).toBeGreaterThanOrEqual(
      (2.6 + 1.8) / 2 + 1
    );
  });
});
