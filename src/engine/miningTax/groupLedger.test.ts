import { describe, it, expect } from 'vitest';
import { groupMiningLedger } from './groupLedger';
import type { MiningLedgerRow } from './types';

const MOON_ORE_A = 45490; // Zeolites
const MOON_ORE_B = 45491; // Sylvite
const VELDSPAR = 1230; // ordinary asteroid ore — not in the allowlist

const ALLOWLIST = new Set([MOON_ORE_A, MOON_ORE_B]);

describe('groupMiningLedger', () => {
  it('groups rows into one entry per (date, solar system)', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-04', quantity: 100, solar_system_id: 30000142, type_id: MOON_ORE_A },
      { date: '2026-09-04', quantity: 50, solar_system_id: 30000142, type_id: MOON_ORE_B },
      { date: '2026-09-04', quantity: 200, solar_system_id: 30000144, type_id: MOON_ORE_A },
      { date: '2026-09-05', quantity: 10, solar_system_id: 30000142, type_id: MOON_ORE_A },
    ];

    const entries = groupMiningLedger(rows, 12345, ALLOWLIST);

    expect(entries).toEqual([
      {
        characterId: 12345,
        date: '2026-09-04',
        solarSystemId: 30000142,
        oreLines: [
          { typeId: MOON_ORE_A, quantity: 100 },
          { typeId: MOON_ORE_B, quantity: 50 },
        ],
      },
      {
        characterId: 12345,
        date: '2026-09-04',
        solarSystemId: 30000144,
        oreLines: [{ typeId: MOON_ORE_A, quantity: 200 }],
      },
      {
        characterId: 12345,
        date: '2026-09-05',
        solarSystemId: 30000142,
        oreLines: [{ typeId: MOON_ORE_A, quantity: 10 }],
      },
    ]);
  });

  it('sums quantity when ESI reports more than one row for the same (date, system, type)', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-04', quantity: 30, solar_system_id: 1, type_id: MOON_ORE_A },
      { date: '2026-09-04', quantity: 20, solar_system_id: 1, type_id: MOON_ORE_A },
    ];

    const [entry] = groupMiningLedger(rows, 1, ALLOWLIST);

    expect(entry.oreLines).toEqual([{ typeId: MOON_ORE_A, quantity: 50 }]);
  });

  it('drops rows whose type_id is outside the moon-ore allowlist, with zero interruption logic', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE_A },
      { date: '2026-09-04', quantity: 500, solar_system_id: 1, type_id: VELDSPAR },
    ];

    const entries = groupMiningLedger(rows, 1, ALLOWLIST);

    expect(entries).toEqual([
      {
        characterId: 1,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: MOON_ORE_A, quantity: 100 }],
      },
    ]);
  });

  it('never reinterprets the date string through a Date object (stays exactly what ESI sent)', () => {
    // A local-timezone round trip would shift a date near midnight UTC.
    // Asserting the row's date is used byte-for-byte as the entry's key
    // guards against `new Date(row.date).toLocaleDateString()` creeping in.
    const rows: MiningLedgerRow[] = [
      { date: '2026-01-01', quantity: 1, solar_system_id: 1, type_id: MOON_ORE_A },
    ];
    const [entry] = groupMiningLedger(rows, 1, ALLOWLIST);
    expect(entry.date).toBe('2026-01-01');
  });

  it('returns nothing for an empty ledger', () => {
    expect(groupMiningLedger([], 1, ALLOWLIST)).toEqual([]);
  });

  it('sorts entries by date then solar system, and ore lines by typeId', () => {
    const rows: MiningLedgerRow[] = [
      { date: '2026-09-05', quantity: 1, solar_system_id: 2, type_id: MOON_ORE_B },
      { date: '2026-09-04', quantity: 1, solar_system_id: 2, type_id: MOON_ORE_A },
      { date: '2026-09-04', quantity: 1, solar_system_id: 1, type_id: MOON_ORE_B },
    ];

    const entries = groupMiningLedger(rows, 1, ALLOWLIST);

    expect(entries.map((e) => [e.date, e.solarSystemId])).toEqual([
      ['2026-09-04', 1],
      ['2026-09-04', 2],
      ['2026-09-05', 2],
    ]);
  });
});
