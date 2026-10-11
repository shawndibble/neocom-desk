import { describe, expect, it } from 'vitest';
import { bestOres } from './bestOres';
import type { SurveyScan } from './series';

const scan = (rocks: SurveyScan['rocks']): SurveyScan => ({ at: 1000, rocks });

describe('bestOres', () => {
  it('ranks ores by ISK per m³, best first', () => {
    const scans = [
      scan([
        { ore: 'Veldspar', volume: 1000, units: 1000 },
        { ore: 'Arkonor', volume: 400, units: 100 },
      ]),
    ];
    const prices = new Map([
      ['Veldspar', 10],
      ['Arkonor', 400],
    ]);
    expect(bestOres(scans, prices)).toEqual([
      { ore: 'Arkonor', iskPerM3: 100, volume: 400, rocks: 1 },
      { ore: 'Veldspar', iskPerM3: 10, volume: 1000, rocks: 1 },
    ]);
  });

  it('leaves out an ore with no price', () => {
    const scans = [scan([{ ore: 'Veldspar', volume: 100, units: 100 }])];
    expect(bestOres(scans, new Map())).toEqual([]);
  });

  it('is empty for no scans', () => {
    expect(bestOres([], new Map([['Veldspar', 10]]))).toEqual([]);
  });
});
