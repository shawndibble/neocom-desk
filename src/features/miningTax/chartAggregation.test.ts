import { describe, it, expect } from 'vitest';
import {
  dailyVolumePoints,
  dailyCountPoints,
  typeVolumeComparison,
  typeCountComparison,
} from './chartAggregation';
import type { MiningYieldRow } from './yieldSnapshot';

function row(date: string, oreLines: { typeId: number; quantity: number }[]): MiningYieldRow {
  return {
    characterId: 1,
    characterName: 'Pilot',
    entry: { characterId: 1, date, solarSystemId: 30000142, oreLines },
    // The aggregation functions only read `entry`, so the rest of `MiningYieldRow`
    // is irrelevant here.
  } as unknown as MiningYieldRow;
}

describe('dailyVolumePoints', () => {
  it('sums known volume per day, divided into a calendar-hour rate', () => {
    const rows = [row('2026-09-01', [{ typeId: 1, quantity: 100 }])];
    const typeVolumes = new Map([[1, 10]]);
    const result = dailyVolumePoints(rows, ['2026-09-01', '2026-09-02'], typeVolumes);
    expect(result).toEqual([
      { date: '2026-09-01', value: 1000 },
      { date: '2026-09-02', value: 0 },
    ]);
  });

  it('never turns an unknown-volume line into a false zero when the day also has known volume', () => {
    const rows = [
      row('2026-09-01', [
        { typeId: 1, quantity: 100 }, // known: 10 m3/unit
        { typeId: 2, quantity: 999 }, // unknown volume — must not zero out the day
      ]),
    ];
    const typeVolumes = new Map([[1, 10]]);
    const result = dailyVolumePoints(rows, ['2026-09-01'], typeVolumes);
    expect(result).toEqual([{ date: '2026-09-01', value: 1000 }]);
  });

  it('reads as a true zero, not a hidden bar, when nothing mined that day has known volume', () => {
    const rows = [row('2026-09-01', [{ typeId: 2, quantity: 999 }])];
    const typeVolumes = new Map<number, number>();
    const result = dailyVolumePoints(rows, ['2026-09-01'], typeVolumes);
    expect(result).toEqual([{ date: '2026-09-01', value: 0 }]);
  });
});

describe('dailyCountPoints', () => {
  it('sums item quantity per day, divided into a calendar-hour rate', () => {
    const rows = [
      row('2026-09-01', [
        { typeId: 1, quantity: 100 },
        { typeId: 2, quantity: 50 },
      ]),
    ];
    const result = dailyCountPoints(rows, ['2026-09-01', '2026-09-02']);
    expect(result).toEqual([
      { date: '2026-09-01', value: 150 },
      { date: '2026-09-02', value: 0 },
    ]);
  });
});

describe('typeVolumeComparison', () => {
  it('totals m3 per type across every row', () => {
    const rows = [
      row('2026-09-01', [
        { typeId: 1, quantity: 100 },
        { typeId: 2, quantity: 5 },
      ]),
      row('2026-09-02', [{ typeId: 1, quantity: 50 }]),
    ];
    const typeNames = new Map([
      [1, 'Veldspar'],
      [2, 'Unknown Ore'],
    ]);
    const typeVolumes = new Map([[1, 10]]);
    const result = typeVolumeComparison(rows, typeNames, typeVolumes);
    expect(result).toEqual(
      expect.arrayContaining([
        { typeId: 1, typeName: 'Veldspar', value: 1500 },
        { typeId: 2, typeName: 'Unknown Ore', value: 0 },
      ])
    );
  });

  it('renders a type with no known unit volume at all as a zero bar, never omitting it', () => {
    const rows = [row('2026-09-01', [{ typeId: 2, quantity: 999 }])];
    const typeNames = new Map([[2, 'Unknown Ore']]);
    const result = typeVolumeComparison(rows, typeNames, new Map());
    expect(result).toEqual([{ typeId: 2, typeName: 'Unknown Ore', value: 0 }]);
  });
});

describe('typeCountComparison', () => {
  it('totals quantity per type across every row', () => {
    const rows = [
      row('2026-09-01', [
        { typeId: 1, quantity: 100 },
        { typeId: 2, quantity: 5 },
      ]),
      row('2026-09-02', [{ typeId: 1, quantity: 50 }]),
    ];
    const typeNames = new Map([[1, 'Veldspar']]);
    const result = typeCountComparison(rows, typeNames);
    expect(result).toEqual(
      expect.arrayContaining([
        { typeId: 1, typeName: 'Veldspar', value: 150 },
        { typeId: 2, typeName: '#2', value: 5 },
      ])
    );
  });
});
