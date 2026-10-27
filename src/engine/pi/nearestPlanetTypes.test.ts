import { describe, expect, it } from 'vitest';
import type { JumpGraph } from '@/engine/route/jumpRoute';
import { nearestSystemsWithPlanetTypes, type NearestPlanetTypesInput } from './nearestPlanetTypes';

// 1 - 2 - 3 - 4 - 5, plus 2 - 6 (a side branch). System 9 has no gates.
const graph: JumpGraph = new Map([
  [1, [2]],
  [2, [1, 3, 6]],
  [3, [2, 4]],
  [4, [3, 5]],
  [5, [4]],
  [6, [2]],
]);
const security: Record<number, number> = { 1: 0.9, 2: 0.8, 3: 0.3, 4: 0.1, 5: -0.5, 6: 0.6, 9: 1 };
const planets = {
  1: { gas: 1 },
  3: { gas: 2, lava: 1 },
  4: { ice: 3 },
  5: { gas: 1 },
  6: { gas: 4 },
  9: { gas: 1 },
};

function ask(over: Partial<NearestPlanetTypesInput> = {}) {
  return nearestSystemsWithPlanetTypes({
    originSystemId: 2,
    planetTypes: ['gas'],
    maxJumps: 10,
    graph,
    securityOf: (id) => security[id],
    systemPlanets: planets,
    ...over,
  });
}

describe('nearestSystemsWithPlanetTypes', () => {
  it('lists the nearest systems first, then the safest at equal distance', () => {
    expect(ask().map((r) => [r.systemId, r.jumps])).toEqual([
      [1, 1],
      [6, 1],
      [3, 1],
      [5, 3],
    ]);
  });

  it('carries security and the counts of the asked types only', () => {
    const lava = ask({ planetTypes: ['gas', 'lava'] }).find((r) => r.systemId === 3);
    expect(lava).toEqual({
      systemId: 3,
      jumps: 1,
      security: 0.3,
      planetCounts: { gas: 2, lava: 1 },
    });
    expect(ask({ planetTypes: ['lava'] })[0]?.planetCounts).toEqual({ lava: 1 });
  });

  it('matches a system holding any one of the asked types', () => {
    expect(ask({ planetTypes: ['ice', 'lava'] }).map((r) => r.systemId)).toEqual([3, 4]);
  });

  it('reports the origin at 0 jumps when it has the type itself', () => {
    expect(ask({ originSystemId: 1 })[0]).toMatchObject({ systemId: 1, jumps: 0 });
  });

  it('caps the search at maxJumps', () => {
    expect(ask({ maxJumps: 1 }).map((r) => r.systemId)).toEqual([1, 6, 3]);
    expect(ask({ maxJumps: 0 })).toEqual([]);
  });

  it('keeps only highsec systems when asked', () => {
    expect(ask({ highsecOnly: true }).map((r) => r.systemId)).toEqual([1, 6]);
  });

  it('treats a system with unknown security as not highsec', () => {
    expect(ask({ highsecOnly: true, securityOf: () => undefined })).toEqual([]);
  });

  it('truncates to the result limit after sorting', () => {
    expect(ask({ limit: 2 }).map((r) => r.systemId)).toEqual([1, 6]);
  });

  it('returns nothing for a type no system holds or an unknown type', () => {
    expect(ask({ planetTypes: ['plasma'] })).toEqual([]);
    expect(ask({ planetTypes: ['jungle' as never] })).toEqual([]);
    expect(ask({ planetTypes: [] })).toEqual([]);
  });

  it('ignores systems the graph cannot reach', () => {
    expect(ask().map((r) => r.systemId)).not.toContain(9);
  });

  it('answers for a gateless origin: itself only', () => {
    expect(ask({ originSystemId: 9 }).map((r) => [r.systemId, r.jumps])).toEqual([[9, 0]]);
    expect(ask({ originSystemId: 9, planetTypes: ['ice'] })).toEqual([]);
  });
});
