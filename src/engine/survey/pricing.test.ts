import { describe, expect, it } from 'vitest';
import { priceScans } from './pricing';
import type { SurveyScan } from './series';

const scans: SurveyScan[] = [
  {
    at: 1,
    rocks: [
      { ore: 'Veldspar', volume: 1000, units: 10_000, isk: 999 },
      { ore: 'Scordite', volume: 500, units: 4_000 },
      { ore: 'Odd Ore', volume: 100, units: 100, isk: 5 },
    ],
  },
];

describe('priceScans', () => {
  it("values each rock as its units times the ore's market price, ignoring the scanner's ISK", () => {
    const priced = priceScans(
      scans,
      new Map([
        ['Veldspar', 10],
        ['Scordite', 20],
      ])
    );
    expect(priced[0].rocks.map((r) => r.isk)).toEqual([100_000, 80_000, undefined]);
  });

  it('drops the scanner ISK when there are no prices at all', () => {
    expect(priceScans(scans, new Map())[0].rocks.every((r) => r.isk === undefined)).toBe(true);
  });

  it('does not touch anything else about the scans', () => {
    const [scan] = priceScans(scans, new Map([['Veldspar', 10]]));
    expect(scan.at).toBe(1);
    expect(scan.rocks[0]).toMatchObject({ ore: 'Veldspar', volume: 1000, units: 10_000 });
    expect(scans[0].rocks[0].isk).toBe(999);
  });

  it('leaves a rock with no units or a zero price unvalued', () => {
    const priced = priceScans(
      [
        {
          at: 1,
          rocks: [
            { ore: 'Veldspar', volume: 5 },
            { ore: 'Scordite', volume: 5, units: 3 },
          ],
        },
      ],
      new Map([
        ['Veldspar', 10],
        ['Scordite', 0],
      ])
    );
    expect(priced[0].rocks.map((r) => r.isk)).toEqual([undefined, undefined]);
  });
});
