import { describe, expect, it } from 'vitest';
import * as mirror from '../../../functions/src/corpTaxBookEngine';
import { DEFAULT_GRACE_HOURS } from './billable';
import { DEFAULT_OVERDUE_DAYS } from './overdue';
import { mergeObservedRows, observedRowKey } from './observed';
import { canOverrideRecordRate, isRetroactiveRate } from './rates';
import {
  DEFAULT_MINIMUM_STATEMENT,
  canRebillFrom,
  daysOnStatements,
  statementDays,
  type Statement,
} from './statements';
import type { ObservedRow } from './types';

// `functions/` cannot import `src/`, so the callables enforce a mirror of these
// engine functions (functions/src/corpTaxBookEngine.ts). This keeps the two
// from drifting: same inputs, same outputs.
const row = (quantity: number, cachedAt: string, over: Partial<ObservedRow> = {}): ObservedRow => ({
  structureId: 1,
  characterId: 2,
  recordedCorporationId: 3,
  typeId: 4,
  date: '2026-07-12',
  quantity,
  cachedAt,
  ...over,
});

const statement = (id: string, from: string, through: string, lineDate?: string) =>
  ({
    id,
    coversFrom: from,
    coversThrough: through,
    lines: lineDate
      ? [
          { kind: 'late-ore', date: lineDate },
          { kind: 'correction', date: '2000-01-01' },
        ]
      : [],
  }) as unknown as Statement;

describe('functions mirror of the Corp Tax Book engine', () => {
  it('merges observed rows identically', () => {
    const existing = [
      row(100, '2026-07-12T10:00:00Z'),
      row(5, '2026-07-12T10:00:00Z', { typeId: 9 }),
    ];
    const fresh = [
      row(50, '2026-07-12T11:00:00Z'),
      row(500, '2026-07-12T09:00:00Z', { typeId: 9 }),
      row(300, '2026-07-12T12:00:00Z'),
      row(1, '2026-07-12T12:00:00Z', { characterId: 77 }),
    ];
    expect(mirror.mergeObservedRows(existing, fresh)).toEqual(mergeObservedRows(existing, fresh));
    expect(mirror.observedRowKey(existing[0])).toBe(observedRowKey(existing[0]));
  });

  it('agrees on dates and rate rules', () => {
    expect(mirror.isRetroactiveRate('2026-07-11', '2026-07-12')).toBe(
      isRetroactiveRate('2026-07-11', '2026-07-12')
    );
    expect(mirror.isRetroactiveRate('2026-07-12', '2026-07-12')).toBe(
      isRetroactiveRate('2026-07-12', '2026-07-12')
    );
    const statements = [
      statement('a', '2026-07-01', '2026-07-31', '2026-06-20'),
      statement('b', '2026-08-01', '2026-08-10'),
    ];
    for (const day of ['2026-06-20', '2026-06-21', '2026-07-31', '2026-08-05', '2026-08-11']) {
      expect(mirror.canOverrideRecordRate(day, statements)).toBe(
        canOverrideRecordRate(day, daysOnStatements(statements))
      );
    }
    expect([...mirror.statementDays(statements[0])].sort()).toEqual(
      [...statementDays(statements[0])].sort()
    );
  });

  it('agrees on which days a paid Statement closes', () => {
    const statements = [
      statement('a', '2026-07-01', '2026-07-31'),
      statement('b', '2026-08-01', '2026-08-31'),
    ];
    const paid = new Set(['a']);
    for (const day of ['2026-07-31', '2026-08-01']) {
      expect(mirror.canRebillFrom(day, statements, paid)).toBe(
        canRebillFrom(day, statements, paid)
      );
    }
  });

  it('keeps the book defaults equal to the engine constants', () => {
    expect(mirror.BOOK_DEFAULTS.graceHours).toBe(DEFAULT_GRACE_HOURS);
    expect(mirror.BOOK_DEFAULTS.minimumStatement).toBe(DEFAULT_MINIMUM_STATEMENT);
    expect(mirror.BOOK_DEFAULTS.overdueDays).toBe(DEFAULT_OVERDUE_DAYS);
  });
});
