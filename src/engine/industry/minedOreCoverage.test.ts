import { describe, expect, it } from 'vitest';
import { minedOreCoverage, minedTypeIds } from './minedOreCoverage';

const reprocessing = {
  '1230': { materials: [{ typeID: 34, quantity: 400 }] },
  '1228': {
    materials: [
      { typeID: 34, quantity: 300 },
      { typeID: 36, quantity: 100 },
    ],
  },
  '16262': { materials: [{ typeID: 16634, quantity: 40 }] },
};

describe('minedTypeIds', () => {
  const histories = [
    { rows: [{ date: '2026-11-10', type_id: 1230 }] },
    {
      rows: [
        { date: '2026-08-01', type_id: 1228 },
        { date: '2026-08-18', type_id: 1228 },
      ],
    },
  ];

  it('combines every character and keeps the last 90 days', () => {
    // today 2026-11-16: window starts 2026-08-19 (90 days inclusive)
    expect(minedTypeIds(histories, '2026-11-16', 90)).toEqual(new Set([1230]));
    expect(minedTypeIds(histories, '2026-11-16', 120)).toEqual(new Set([1230, 1228]));
  });
});

describe('minedOreCoverage', () => {
  it('lists mined ores per short mineral and the minerals none yield', () => {
    const r = minedOreCoverage({
      short: [34, 36, 38],
      mined: new Set([1230, 1228]),
      reprocessing,
    });
    expect(r.byMineral).toEqual({ 34: [1228, 1230], 36: [1228] });
    expect(r.buyThese).toEqual([38]);
  });

  it('ignores ore that yields no short mineral and unknown types', () => {
    const r = minedOreCoverage({ short: [34], mined: new Set([16262, 999]), reprocessing });
    expect(r.byMineral).toEqual({});
    expect(r.buyThese).toEqual([34]);
  });
});
