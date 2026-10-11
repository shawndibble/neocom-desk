import { describe, expect, it } from 'vitest';
import { payeesOwed } from './miningTaxPayees';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const DAY = 86_400_000;

const row = (
  daysAgo: number,
  ...assignments: { status: string; taxOwed: number; payeeId?: string }[]
) => ({ entry: { date: new Date(NOW - daysAgo * DAY).toISOString() }, assignments });

const names = new Map([
  ['p1', 'Corp Tax'],
  ['p2', 'Alliance'],
]);

describe('payeesOwed', () => {
  it('sums what is still outstanding per payee, the most owed first', () => {
    const owed = payeesOwed(
      [
        row(3, { status: 'outstanding', taxOwed: 100, payeeId: 'p1' }),
        row(5, { status: 'outstanding', taxOwed: 50, payeeId: 'p1' }),
        row(1, { status: 'outstanding', taxOwed: 400, payeeId: 'p2' }),
      ],
      names,
      NOW
    );
    expect(owed).toEqual([
      { payeeId: 'p2', name: 'Alliance', unpaidIsk: 400, oldestDays: 1, entries: 1 },
      { payeeId: 'p1', name: 'Corp Tax', unpaidIsk: 150, oldestDays: 5, entries: 2 },
    ]);
  });

  it('leaves out paid assignments and entries with nothing outstanding', () => {
    const owed = payeesOwed(
      [
        row(9, { status: 'paid', taxOwed: 999, payeeId: 'p1' }),
        row(2, { status: 'outstanding', taxOwed: 10, payeeId: 'p1' }),
        row(4),
      ],
      names,
      NOW
    );
    expect(owed).toHaveLength(1);
    expect(owed[0]).toMatchObject({ unpaidIsk: 10, oldestDays: 2, entries: 1 });
  });

  it('files an outstanding assignment with no payee under an empty id and name', () => {
    const owed = payeesOwed([row(2, { status: 'outstanding', taxOwed: 7 })], names, NOW);
    expect(owed).toEqual([{ payeeId: '', name: '', unpaidIsk: 7, oldestDays: 2, entries: 1 }]);
  });

  it('keeps the id as the name for a payee that has since been deleted', () => {
    const owed = payeesOwed(
      [row(2, { status: 'outstanding', taxOwed: 7, payeeId: 'gone' })],
      names,
      NOW
    );
    expect(owed[0]!.name).toBe('gone');
  });

  it('counts a split entry once per assignment, and its oldest day as whole days', () => {
    const owed = payeesOwed(
      [
        row(
          2.9,
          { status: 'outstanding', taxOwed: 1, payeeId: 'p1' },
          { status: 'outstanding', taxOwed: 2, payeeId: 'p1' }
        ),
      ],
      names,
      NOW
    );
    expect(owed[0]).toMatchObject({ unpaidIsk: 3, entries: 2, oldestDays: 2 });
  });
});
