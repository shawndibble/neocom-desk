import { describe, expect, it } from 'vitest';
import { buildWorth, diffHulls, sameHulls } from './dscanWorth';

describe('buildWorth', () => {
  it('prices each hull and sums the total, largest line first', () => {
    const worth = buildWorth(
      [
        { typeId: 1, count: 8 },
        { typeId: 2, count: 1 },
      ],
      new Map([
        [1, 10],
        [2, 200],
      ])
    );
    expect(worth.lines).toEqual([
      { typeId: 2, count: 1, unit: 200, total: 200 },
      { typeId: 1, count: 8, unit: 10, total: 80 },
    ]);
    expect(worth.total).toBe(280);
    expect(worth.unpriced).toBe(0);
  });

  it('marks a hull with no price as unavailable, never 0, and counts it', () => {
    const worth = buildWorth(
      [
        { typeId: 1, count: 2 },
        { typeId: 2, count: 3 },
        { typeId: 3, count: 1 },
      ],
      new Map<number, number | null>([
        [1, 5],
        [2, null],
      ])
    );
    expect(worth.lines.map((l) => l.typeId)).toEqual([1, 2, 3]);
    expect(worth.lines[1]).toEqual({ typeId: 2, count: 3, unit: null, total: null });
    expect(worth.lines[2].total).toBeNull();
    expect(worth.total).toBe(10);
    expect(worth.unpriced).toBe(4);
  });
});

describe('diffHulls', () => {
  it('reports arrivals, departures and changes, skipping unchanged hulls', () => {
    const diff = diffHulls(
      [
        { typeId: 1, count: 8 },
        { typeId: 2, count: 2 },
        { typeId: 4, count: 1 },
      ],
      [
        { typeId: 1, count: 5 },
        { typeId: 2, count: 2 },
        { typeId: 3, count: 2 },
      ]
    );
    expect(diff).toEqual([
      { typeId: 1, delta: 3 },
      { typeId: 3, delta: -2 },
      { typeId: 4, delta: 1 },
    ]);
  });
});

describe('sameHulls', () => {
  it('ignores order', () => {
    const a = [
      { typeId: 1, count: 2 },
      { typeId: 2, count: 1 },
    ];
    expect(sameHulls(a, [...a].reverse())).toBe(true);
    expect(sameHulls(a, [{ typeId: 1, count: 2 }])).toBe(false);
  });
});
