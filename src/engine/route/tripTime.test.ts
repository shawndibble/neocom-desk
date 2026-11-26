import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alignTimeSeconds } from '@/engine/fittings/stats';
import {
  GATE_SESSION_SECONDS,
  approachSeconds,
  tripTime,
  warpSeconds,
  type GatePositions,
  type HullFlight,
} from './tripTime';

const AU_MM = 149_597.87;
const FAST: HullFlight = { massKg: 1.1e6, agility: 3.2, maxVelocityMs: 280, warpSpeedAuPerS: 5 };
const SLOW: HullFlight = { massKg: 1.2e9, agility: 0.04, maxVelocityMs: 60, warpSpeedAuPerS: 1.5 };

const gate = (id: number): { entry: { kind: 'gate' } } & { systemId: number } => ({
  systemId: id,
  entry: { kind: 'gate' },
});
const start = (id: number) => ({ systemId: id, entry: null });

function gatesApart(apartAu: number): GatePositions {
  return {
    1: [2, AU_MM, 0, 0],
    2: [1, 0, 0, 0, 3, Math.round(apartAu * AU_MM), 0, 0],
    3: [2, AU_MM, 0, 0],
  };
}

describe('warpSeconds', () => {
  it('is longer for a longer warp and for a slower warp speed', () => {
    expect(warpSeconds(40 * 149_597_870_700, 3, 280)).toBeGreaterThan(
      warpSeconds(5 * 149_597_870_700, 3, 280)
    );
    expect(warpSeconds(10 * 149_597_870_700, 1.5, 280)).toBeGreaterThan(
      warpSeconds(10 * 149_597_870_700, 5, 280)
    );
  });

  it('is zero for no distance and keeps growing across the short-warp boundary', () => {
    expect(warpSeconds(0, 3, 280)).toBe(0);
    let previous = 0;
    for (const au of [0.01, 0.1, 1, 2, 4, 5, 6, 20]) {
      const t = warpSeconds(au * 149_597_870_700, 3, 280);
      expect(t).toBeGreaterThan(previous);
      previous = t;
    }
  });
});

describe('approachSeconds', () => {
  it('takes longer than the straight-line time at top speed, and longer for a heavier hull', () => {
    expect(approachSeconds(12_500, FAST)).toBeGreaterThan(12_500 / FAST.maxVelocityMs);
    expect(approachSeconds(12_500, SLOW) / (12_500 / SLOW.maxVelocityMs)).toBeGreaterThan(
      approachSeconds(12_500, FAST) / (12_500 / FAST.maxVelocityMs)
    );
  });

  it('covers the distance on the acceleration curve', () => {
    const t = approachSeconds(12_500, FAST);
    const tau = (FAST.agility * FAST.massKg) / 1e6;
    const d = FAST.maxVelocityMs * (t - tau * (1 - Math.exp(-t / tau)));
    expect(d).toBeCloseTo(12_500, 1);
  });
});

describe('tripTime', () => {
  const rows = [start(1), gate(2), gate(3)];

  it('gives warp to 0 and a longer autopilot for an all-gate route', () => {
    const time = tripTime(rows, [2], gatesApart(10), FAST);
    expect(time).not.toBeNull();
    expect(time!.partial).toBe(false);
    expect(time!.warpToZeroSeconds).toBeGreaterThan(2 * GATE_SESSION_SECONDS);
    expect(time!.autopilotSeconds).toBeGreaterThan(time!.warpToZeroSeconds);
  });

  it('sums align, warp and the session overhead per jump', () => {
    const time = tripTime(rows, [2], gatesApart(10), FAST)!;
    const align = alignTimeSeconds(FAST.massKg, FAST.agility);
    const warp = (au: number) => warpSeconds(au * 149_597_870_700, 5, FAST.maxVelocityMs);
    const expected = 3 * align + warp(1) + warp(10) + warp(1) + 2 * GATE_SESSION_SECONDS;
    expect(time.warpToZeroSeconds).toBeCloseTo(expected, 0);
  });

  it('is longer for a slower-aligning, slower-warping hull on the same route', () => {
    const fast = tripTime(rows, [2], gatesApart(10), FAST)!;
    const slow = tripTime(rows, [2], gatesApart(10), SLOW)!;
    expect(slow.warpToZeroSeconds).toBeGreaterThan(fast.warpToZeroSeconds);
    expect(slow.autopilotSeconds).toBeGreaterThan(fast.autopilotSeconds);
  });

  it('grows with the entry to exit gate distance', () => {
    const near = tripTime(rows, [2], gatesApart(2), FAST)!;
    const far = tripTime(rows, [2], gatesApart(40), FAST)!;
    expect(far.warpToZeroSeconds).toBeGreaterThan(near.warpToZeroSeconds);
  });

  it('times a stop in the middle as two warps to the star', () => {
    const through = tripTime(rows, [], gatesApart(10), FAST)!;
    const stop = tripTime(rows, [1], gatesApart(10), FAST)!;
    const align = alignTimeSeconds(FAST.massKg, FAST.agility);
    expect(stop.warpToZeroSeconds - through.warpToZeroSeconds).toBeCloseTo(align, 0);
  });

  it('leaves a hole hop out and says the figure is partial', () => {
    const viaHole = [
      start(1),
      { systemId: 2, entry: { kind: 'hole' as const, hole: {} as never } },
      gate(3),
    ];
    const time = tripTime(viaHole, [2], gatesApart(10), FAST)!;
    expect(time.partial).toBe(true);
    const gateOnly = tripTime(rows, [2], gatesApart(10), FAST)!;
    expect(time.warpToZeroSeconds).toBeLessThan(gateOnly.warpToZeroSeconds);
  });

  it('gives no figure with no gate jump or a gate position the table lacks', () => {
    expect(tripTime([start(1)], [0], gatesApart(10), FAST)).toBeNull();
    const noGates = { 1: [2, AU_MM, 0, 0], 3: [2, AU_MM, 0, 0] };
    expect(tripTime(rows, [2], noGates, FAST)).toBeNull();
  });
});

describe('baked gate positions', () => {
  const read = <T>(file: string): T =>
    JSON.parse(readFileSync(new URL(`../../../public/data/${file}`, import.meta.url), 'utf8')) as T;
  const gates = read<GatePositions>('market/gates.json');
  const jumps = read<Record<string, number[]>>('market/jumps.json');

  it('holds a gate for every jump in the stargate graph (drift check)', () => {
    const missing: string[] = [];
    for (const [from, tos] of Object.entries(jumps)) {
      for (const to of tos) {
        const flat = gates[from] ?? [];
        let found = false;
        for (let i = 0; i < flat.length; i += 4) found ||= flat[i] === to;
        if (!found) missing.push(`${from}->${to}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('times Jita to Perimeter as a short trip', () => {
    const jita = 30000142;
    const perimeter = jumps[jita][0];
    const time = tripTime([start(jita), gate(perimeter)], [1], gates, FAST)!;
    expect(time.warpToZeroSeconds).toBeGreaterThan(10);
    expect(time.warpToZeroSeconds).toBeLessThan(300);
  });
});
