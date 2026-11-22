import { describe, expect, it } from 'vitest';
import { accountWindowStart } from './minerScope';

describe('accountWindowStart', () => {
  it('reads the whole history from the book’s start while there is no checkpoint', () => {
    expect(accountWindowStart(undefined, '2026-08-01')).toBe('2026-08-01');
  });

  it('reads from the day after the checkpoint when it owes nothing', () => {
    expect(accountWindowStart({ through: '2026-09-30', owed: [] }, '2026-08-01')).toBe(
      '2026-10-01'
    );
  });

  it('reads from the checkpoint’s oldest owed day, so the page lists it', () => {
    expect(
      accountWindowStart(
        { through: '2026-09-30', owed: [{ date: '2026-09-12', remaining: 1e6 }] },
        '2026-08-01'
      )
    ).toBe('2026-09-12');
  });

  it('never reads before the book’s start', () => {
    expect(accountWindowStart({ through: '2026-07-31', owed: [] }, '2026-08-15')).toBe(
      '2026-08-15'
    );
  });
});
