import { describe, expect, it } from 'vitest';
import { cheaperNearbySystems } from './cheaperNearbySystems';

// 1 - 2 - 3 - 4 - 5 - 6 - 7 (a line), plus 8 off 1.
const graph = new Map<number, readonly number[]>([
  [1, [2, 8]],
  [2, [1, 3]],
  [3, [2, 4]],
  [4, [3, 5]],
  [5, [4, 6]],
  [6, [5, 7]],
  [7, [6]],
  [8, [1]],
]);

describe('cheaperNearbySystems', () => {
  it('lists systems within range that are strictly cheaper, cheapest first', () => {
    const indices = new Map([
      [1, 0.05],
      [2, 0.03],
      [3, 0.02],
      [4, 0.05],
      [8, 0.01],
    ]);
    expect(cheaperNearbySystems(graph, 1, indices, 0.05)).toEqual([
      { systemId: 8, jumps: 1, index: 0.01 },
      { systemId: 3, jumps: 2, index: 0.02 },
      { systemId: 2, jumps: 1, index: 0.03 },
    ]);
  });

  it('ignores systems beyond maxJumps and systems with no index', () => {
    const indices = new Map([
      [1, 0.05],
      [6, 0.01],
      [7, 0.001],
    ]);
    expect(cheaperNearbySystems(graph, 1, indices, 0.05, { maxJumps: 5 })).toEqual([
      { systemId: 6, jumps: 5, index: 0.01 },
    ]);
  });

  it('caps the list, keeping the cheapest', () => {
    const indices = new Map([
      [2, 0.04],
      [3, 0.03],
      [4, 0.02],
      [5, 0.01],
    ]);
    const found = cheaperNearbySystems(graph, 1, indices, 0.05, { limit: 2 });
    expect(found.map((s) => s.systemId)).toEqual([5, 4]);
  });

  it('breaks ties by fewer jumps, then id', () => {
    const indices = new Map([
      [3, 0.01],
      [2, 0.01],
      [8, 0.01],
    ]);
    expect(cheaperNearbySystems(graph, 1, indices, 0.05).map((s) => s.systemId)).toEqual([2, 8, 3]);
  });

  it('is empty when nothing is cheaper (the cheapest system itself)', () => {
    expect(cheaperNearbySystems(graph, 1, new Map([[2, 0.05]]), 0.05)).toEqual([]);
  });
});
