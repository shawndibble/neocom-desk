import { describe, expect, it } from 'vitest';
import { miningSystems, utcDate, yourShare, type LedgerLine, type OreType } from './yourShare';

const TYPES = new Map<number, OreType>([
  [1, { name: 'Veldspar', volume: 0.1 }],
  [2, { name: 'Scordite', volume: 0.15 }],
  [3, { name: 'Clear Icicle', volume: 1000 }],
]);
const ORES = new Set(['Veldspar', 'Scordite']);
const SYSTEM = 30000142;

const row = (date: string, type_id: number, quantity: number, system = SYSTEM): LedgerLine => ({
  date,
  quantity,
  solar_system_id: system,
  type_id,
});

describe('utcDate', () => {
  it('is the EVE (UTC) calendar date', () => {
    expect(utcDate(Date.UTC(2026, 9, 8, 23, 59, 59))).toBe('2026-10-08');
    expect(utcDate(Date.UTC(2026, 9, 9, 0, 0, 0))).toBe('2026-10-09');
  });
});

describe('yourShare', () => {
  const base = {
    systemId: SYSTEM,
    fromDate: '2026-10-08',
    toDate: '2026-10-08',
    types: TYPES,
    oreNames: ORES,
    surveyMined: 1000,
  };

  it('is units times unit volume, for the survey ores in the chosen system on the survey day', () => {
    const result = yourShare({
      ...base,
      rows: [
        row('2026-10-08', 1, 2000), // 200 m3 of Veldspar
        row('2026-10-08', 2, 1000), // 150 m3 of Scordite
        row('2026-10-08', 1, 500), // 50 m3 more Veldspar
      ],
    });
    expect(result.minedM3).toBe(400);
    expect(result.percentOfMined).toBe(40);
  });

  it('leaves out other systems, other days, other ores and unknown types', () => {
    const result = yourShare({
      ...base,
      rows: [
        row('2026-10-08', 1, 1000, 30000144), // another system
        row('2026-10-07', 1, 1000), // the day before
        row('2026-10-09', 1, 1000), // the day after
        row('2026-10-08', 3, 5), // ice, not in this survey
        row('2026-10-08', 99, 5), // type we know nothing about
        row('2026-10-08', 1, 1000), // the one that counts: 100 m3
      ],
    });
    expect(result.minedM3).toBe(100);
  });

  it('counts both days when the survey runs past midnight UTC', () => {
    const result = yourShare({
      ...base,
      toDate: '2026-10-09',
      rows: [
        row('2026-10-07', 1, 1000),
        row('2026-10-08', 1, 1000),
        row('2026-10-09', 1, 1000),
        row('2026-10-10', 1, 1000),
      ],
    });
    expect(result.minedM3).toBe(200);
  });

  it('caps the share at 100% and has none when nothing was mined from the field', () => {
    const rows = [row('2026-10-08', 1, 100_000)]; // 10,000 m3, more than the survey saw mined
    expect(yourShare({ ...base, rows }).percentOfMined).toBe(100);
    expect(yourShare({ ...base, rows, surveyMined: 0 }).percentOfMined).toBeNull();
  });

  it('is zero with an empty ledger', () => {
    expect(yourShare({ ...base, rows: [] })).toEqual({ minedM3: 0, percentOfMined: 0 });
  });
});

describe('miningSystems', () => {
  const row = (date: string, solar_system_id: number, quantity = 10): LedgerLine => ({
    date,
    solar_system_id,
    quantity,
    type_id: 1,
  });

  it('lists the systems mined in on the survey days, the latest day first', () => {
    const rows = [
      row('2026-10-07', 3),
      row('2026-10-08', 1),
      row('2026-10-09', 2),
      row('2026-10-01', 9),
    ];
    expect(miningSystems(rows, '2026-10-07', '2026-10-09')).toEqual([2, 1, 3]);
  });

  it('puts the system with more ore first within a day, and lists each system once', () => {
    const rows = [
      row('2026-10-09', 1, 5),
      row('2026-10-09', 2, 50),
      row('2026-10-09', 1, 5),
      row('2026-10-08', 2),
    ];
    expect(miningSystems(rows, '2026-10-08', '2026-10-09')).toEqual([2, 1]);
  });

  it('is empty when nothing was mined on those days', () => {
    expect(miningSystems([row('2026-09-01', 1)], '2026-10-08', '2026-10-09')).toEqual([]);
  });
});
