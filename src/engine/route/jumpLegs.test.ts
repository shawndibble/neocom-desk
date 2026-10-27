import { describe, expect, it } from 'vitest';
import type { JumpGraph } from './jumpRoute';
import type { JumpSystem } from './jumpDrive';
import { hullJumpDrive, jumpWayFacts, routeWithJumps } from './jumpLegs';

// A gate chain 1-2-3-4-5-6 along x, one ly apart per step (systems 3.. are lowsec).
function chain(count: number, highsec: number[] = []) {
  const graph = new Map<number, number[]>();
  const systems: JumpSystem[] = [];
  for (let id = 1; id <= count; id += 1) {
    graph.set(
      id,
      [id - 1, id + 1].filter((n) => n >= 1 && n <= count)
    );
    systems.push({
      id,
      x: id,
      y: 0,
      z: 0,
      security: highsec.includes(id) ? 0.9 : -0.2,
      regionId: 10000001,
    });
  }
  return { graph: graph as JumpGraph, systems };
}

const drive = { rangeLy: 4, fuelPerLy: 100, distanceFactor: 1 };

describe('routeWithJumps', () => {
  it('replaces a long gate walk with a jump, keeping gate hops where jumping does not pay', () => {
    const { graph, systems } = chain(12);
    const result = routeWithJumps(graph, systems, 1, 12, drive);
    expect(result.kind).toBe('route');
    if (result.kind !== 'route') return;
    expect(result.systems[0]).toBe(1);
    expect(result.systems.at(-1)).toBe(12);
    expect(result.hops.some((hop) => hop.kind === 'jump')).toBe(true);
    for (const hop of result.hops) {
      if (hop.kind === 'jump') expect(hop.distanceLy).toBeLessThanOrEqual(4);
    }
    expect(result.hops).toHaveLength(result.systems.length - 1);
  });

  it('is no-route when no jump leg helps (a short trip stays on the gates)', () => {
    const { graph, systems } = chain(3);
    expect(routeWithJumps(graph, systems, 1, 3, drive)).toEqual({ kind: 'no-route' });
  });

  it('never lands a jump in highsec, but may fly in by gate', () => {
    const { graph, systems } = chain(12, [10, 11, 12]);
    const result = routeWithJumps(graph, systems, 1, 12, drive);
    expect(result.kind).toBe('route');
    if (result.kind !== 'route') return;
    for (const hop of result.hops) {
      if (hop.kind === 'jump') expect(hop.to).toBeLessThan(10);
    }
    expect(result.hops.at(-1)?.kind).toBe('gate');
  });

  it('crosses a gap the gates cannot, by jumping', () => {
    const { systems } = chain(8);
    const graph = new Map<number, number[]>([
      [1, [2]],
      [2, [1]],
      [3, []],
      [4, []],
      [5, []],
      [6, []],
      [7, [8]],
      [8, [7]],
    ]) as JumpGraph;
    const result = routeWithJumps(graph, systems, 1, 8, { ...drive, rangeLy: 6 });
    expect(result.kind).toBe('route');
  });

  it('respects the longest single jump', () => {
    const { systems } = chain(8);
    const graph = new Map(systems.map((s) => [s.id, [] as number[]])) as JumpGraph;
    expect(routeWithJumps(graph, systems, 1, 8, { ...drive, rangeLy: 3 })).toEqual({
      kind: 'route',
      systems: expect.any(Array),
      hops: expect.any(Array),
    });
    const tooShort = routeWithJumps(graph, systems, 1, 8, { ...drive, rangeLy: 0.5 });
    expect(tooShort).toEqual({ kind: 'no-route' });
  });
});

describe('hullJumpDrive', () => {
  it('trains the two skills to V: range +20% a level, fuel -10% a level', () => {
    expect(hullJumpDrive(547, [3.5, 16274, 3000])).toEqual({
      rangeLy: 7,
      fuelTypeId: 16274,
      fuelPerLy: 1500,
      distanceFactor: 1,
    });
  });

  it('counts less of a Black Ops or Jump Freighter jump toward fatigue', () => {
    expect(hullJumpDrive(898, [4, 1, 100]).distanceFactor).toBe(0.25);
    expect(hullJumpDrive(902, [5, 1, 100]).distanceFactor).toBe(0.1);
  });
});

describe('jumpWayFacts', () => {
  it('adds up jumps, light years and fuel, and the time the reactivation timers cost', () => {
    const facts = jumpWayFacts(
      [
        { kind: 'jump', from: 1, to: 2, distanceLy: 4 },
        { kind: 'gate', from: 2, to: 3 },
        { kind: 'jump', from: 3, to: 4, distanceLy: 3 },
      ],
      { fuelPerLy: 100, distanceFactor: 1 }
    );
    expect(facts.jumps).toBe(2);
    expect(facts.totalLy).toBe(7);
    expect(facts.fuel).toBe(700);
    // After a 4 ly jump the timer is 5 min; fatigue 50 min.
    expect(facts.arriveMinutes).toBeGreaterThanOrEqual(5);
    // Second jump: fatigue grows, and decays only by the wait in between.
    expect(facts.fatigueMinutes).toBeGreaterThan(0);
  });

  it('carries no figures for a route with no jump legs', () => {
    expect(
      jumpWayFacts([{ kind: 'gate', from: 1, to: 2 }], { fuelPerLy: 1, distanceFactor: 1 })
    ).toMatchObject({ jumps: 0, totalLy: 0, fuel: 0, fatigueMinutes: 0 });
  });
});
