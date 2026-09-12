import { describe, it, expect } from 'vitest';
import { groupMiningYield } from './yieldGrouping';
import type { MiningLedgerRow } from './types';

const VELDSPAR = 1230; // ordinary asteroid ore
const ICE = 16262; // ordinary ice
const MOON_ORE = 45490; // Zeolites — moon ore is still ore, so it counts here too
const UNCLASSIFIED = 99999; // on no allowlist the caller passes in at all

const ALLOWLIST = new Set([VELDSPAR, ICE, MOON_ORE]);

describe('groupMiningYield', () => {
  it('groups rows into one entry per (date, solar system), unfiltered by moon-ore status', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-04', quantity: 1000, solar_system_id: 30000142, type_id: VELDSPAR },
      { date: '2026-09-04', quantity: 200, solar_system_id: 30000142, type_id: ICE },
      { date: '2026-09-04', quantity: 50, solar_system_id: 30000144, type_id: MOON_ORE },
      { date: '2026-09-05', quantity: 10, solar_system_id: 30000142, type_id: VELDSPAR },
    ];

    const entries = groupMiningYield(rows, 12345, ALLOWLIST);

    expect(entries).toEqual([
      {
        characterId: 12345,
        date: '2026-09-04',
        solarSystemId: 30000142,
        oreLines: [
          { typeId: VELDSPAR, quantity: 1000 },
          { typeId: ICE, quantity: 200 },
        ],
      },
      {
        characterId: 12345,
        date: '2026-09-04',
        solarSystemId: 30000144,
        oreLines: [{ typeId: MOON_ORE, quantity: 50 }],
      },
      {
        characterId: 12345,
        date: '2026-09-05',
        solarSystemId: 30000142,
        oreLines: [{ typeId: VELDSPAR, quantity: 10 }],
      },
    ]);
  });

  it('sums quantity when ESI reports more than one row for the same (date, system, type)', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-04', quantity: 30, solar_system_id: 1, type_id: VELDSPAR },
      { date: '2026-09-04', quantity: 20, solar_system_id: 1, type_id: VELDSPAR },
    ];

    const [entry] = groupMiningYield(rows, 1, ALLOWLIST);

    expect(entry.oreLines).toEqual([{ typeId: VELDSPAR, quantity: 50 }]);
  });

  it('drops rows outside the allowlist it is handed rather than guessing at an unclassified type', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: VELDSPAR },
      { date: '2026-09-04', quantity: 7, solar_system_id: 1, type_id: UNCLASSIFIED },
    ];

    const entries = groupMiningYield(rows, 1, ALLOWLIST);

    expect(entries).toEqual([
      {
        characterId: 1,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: VELDSPAR, quantity: 100 }],
      },
    ]);
  });

  it('never reinterprets the date string through a Date object', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-01-01', quantity: 1, solar_system_id: 1, type_id: VELDSPAR },
    ];
    const [entry] = groupMiningYield(rows, 1, ALLOWLIST);
    expect(entry.date).toBe('2026-01-01');
  });

  it('returns nothing for an empty ledger', () => {
    expect(groupMiningYield([], 1, ALLOWLIST)).toEqual([]);
  });

  it('sorts entries by date then solar system, and ore lines by typeId', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-05', quantity: 1, solar_system_id: 2, type_id: ICE },
      { date: '2026-09-04', quantity: 1, solar_system_id: 2, type_id: VELDSPAR },
      { date: '2026-09-04', quantity: 1, solar_system_id: 1, type_id: ICE },
    ];

    const entries = groupMiningYield(rows, 1, ALLOWLIST);

    expect(entries.map((e) => [e.date, e.solarSystemId])).toEqual([
      ['2026-09-04', 1],
      ['2026-09-04', 2],
      ['2026-09-05', 2],
    ]);
  });
});
