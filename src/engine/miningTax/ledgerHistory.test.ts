import { describe, expect, it } from 'vitest';
import { LEDGER_HISTORY_DAYS, mergeLedgerHistory } from './ledgerHistory';
import type { MiningLedgerRow } from './types';

function row(date: string, quantity: number, type_id = 1230, solar_system_id = 1): MiningLedgerRow {
  return { date, quantity, solar_system_id, type_id };
}

describe('mergeLedgerHistory', () => {
  it('keeps every stored row the fresh fetch no longer reports', () => {
    const stored = [row('2026-07-01', 100), row('2026-08-20', 200)];
    const fresh = [row('2026-09-20', 300)];

    expect(mergeLedgerHistory(stored, fresh)).toEqual([
      row('2026-07-01', 100),
      row('2026-08-20', 200),
      row('2026-09-20', 300),
    ]);
  });

  it("lets the fresh fetch's quantity win for the same day, system and type — today's number grows", () => {
    const stored = [row('2026-09-22', 100)];
    const fresh = [row('2026-09-22', 450)];

    expect(mergeLedgerHistory(stored, fresh)).toEqual([row('2026-09-22', 450)]);
  });

  it('never duplicates a day/system/type, but keeps distinct systems and types apart', () => {
    const stored = [row('2026-09-10', 1, 1230, 1), row('2026-09-10', 2, 1228, 1)];
    const fresh = [
      row('2026-09-10', 5, 1230, 1),
      row('2026-09-10', 7, 1230, 2),
      row('2026-09-10', 2, 1228, 1),
    ];

    expect(mergeLedgerHistory(stored, fresh)).toEqual([
      row('2026-09-10', 2, 1228, 1),
      row('2026-09-10', 5, 1230, 1),
      row('2026-09-10', 7, 1230, 2),
    ]);
  });

  it(`drops rows more than ${LEDGER_HISTORY_DAYS} days before the newest day held`, () => {
    // Newest day 2026-09-22; the 90-day window is 2026-06-25 .. 2026-09-22.
    const stored = [row('2026-06-24', 1), row('2026-06-25', 2)];
    const fresh = [row('2026-09-22', 3)];

    expect(mergeLedgerHistory(stored, fresh)).toEqual([row('2026-06-25', 2), row('2026-09-22', 3)]);
  });

  it('sums rows one fetch reports twice for the same day, system and type, before replacing', () => {
    const stored = [row('2026-09-04', 999)];
    const fresh = [row('2026-09-04', 40), row('2026-09-04', 20)];

    expect(mergeLedgerHistory(stored, fresh)).toEqual([row('2026-09-04', 60)]);
  });

  it('returns an empty history for empty inputs', () => {
    expect(mergeLedgerHistory([], [])).toEqual([]);
  });
});
